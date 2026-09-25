#!/usr/bin/env python3
"""
Banc IndexedDB (MODE-1010-bis) — validation Chromium réel du module
src/lib/offline-db.ts du dépôt julaba (bundle 0 mock).

Scénarios (design MODE-1010) :
  S1  Enfilement offline réel + rejeu au retour réseau (FIFO, markSynced ciblé)
  S2  Kill tab mid-write : atomicité clear+put (jamais d'état partiel)
  S3  Upgrade avec file localStorage préexistante (import transactionnel + purge après commit)
  S4  Quota / IndexedDB indisponible : repli transparent + contrat d'échec d'écriture
  S5  Concurrence Web Locks × IDB (1 page concurrente + 2 onglets, 0 perte)

Chaque scénario tourne dans un CONTEXT Playwright neuf (stockage isolé).
Serveur HTTP local (http://localhost = contexte sécurisé → Web Locks OK).

Reproduction (MODE-1010-ter, banc exécuté 25/09/2026 : 20/20 PASS) :
  cd à la racine du dépôt puis :
  1) bundle du module RÉEL (0 copie, 0 mock) :
     bun build scripts/banc-indexeddb/banc-entry.ts --bundle --format=iife \
       --target=browser \
       --define 'process.env.JULABA_QUEUE_STORE=window.__JULABA_QUEUE_STORE' \
       --external '@/lib/notifications/triggers' \
       --external '@/lib/notifications/events' \
       --outfile scripts/banc-indexeddb/banc.bundle.js
  2) banc (python3 + playwright + Chromium) :
     python3 scripts/banc-indexeddb/banc.py
Le bundle banc.bundle.js est un artefact local (gitignoré) — régénéré par 1).
"""

import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

DIR = Path(__file__).parent
PORT = 8931
BASE = f"http://localhost:{PORT}"

RESULTS: list[dict] = []


def record(scenario: str, name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append({"scenario": scenario, "check": name, "ok": ok, "detail": detail})
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # /banc-ping POST : 200 (le gestionnaire du banc exige r.ok pour simuler
        # un rejeu serveur réussi)
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length:
            self.rfile.read(length)
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/banc-ping"):
            body = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        path = self.path.split("?")[0]
        if path == "/" or path == "/banc":
            fname = "banc.html"
        else:
            fname = path.lstrip("/").replace("/", "_")
        f = DIR / fname
        if f.is_file():
            ctype = "text/html" if fname.endswith(".html") else "application/javascript"
            body = f.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *a):  # silence
        pass


def new_page(browser, offline: bool = False):
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto(f"{BASE}/banc", wait_until="load")
    page.wait_for_function("typeof window.BANC_MOD !== 'undefined'")
    if offline:
        ctx.set_offline(True)  # coupure APRÈS chargement (équivalent mode avion en cours d'usage)
    return ctx, page


def make_payload(owner: str, i: int, size: int = 100) -> dict:
    return {"ownerId": owner, "data": "x" * size, "n": i}


# ---------------------------------------------------------------- S1
def s1_offline_replay(browser):
    print("S1 — enfilement offline réel + rejeu au retour réseau (flag indexeddb)")
    owner = "banc-owner"
    ctx, page = new_page(browser, offline=True)
    page.evaluate("v => window.BANC_SET_FLAG(v)", "indexeddb")

    page.evaluate(
        """([owner]) => {
          window.BANC_MOD.setSyncOwnerId(owner)
          window.BANC_MOD.registerSyncHandler('banc-entity', async (payload) => {
            const r = await fetch('/banc-ping', { method: 'POST' })
            if (!r.ok) throw new Error('reseau')
          })
        }""",
        [owner],
    )

    # --- Enfilement HORS LIGNE réel (contexte offline : /banc-ping injoignable)
    ids = page.evaluate(
        """async ([owner]) => {
          const out = []
          for (let i = 0; i < 3; i++) {
            const r = await window.BANC_MOD.queuePendingSync('banc-entity', { ownerId: owner, n: i })
            if (!r.ok) out.push('ERREUR:' + r.error)
            else out.push(true)
          }
          return out
        }""",
        [owner],
    )
    record("S1", "3 enfilements offline ok", all(v is True for v in ids), str(ids))

    q_off = page.evaluate(
        "() => window.BANC_MOD.getPendingSyncEntries().then(l => l.map(e => e.payload.n))"
    )
    record("S1", "file FIFO hors ligne = [0,1,2]", q_off == [0, 1, 2], str(q_off))

    # --- Rejeu au retour réseau
    ctx.set_offline(False)
    time.sleep(0.3)
    flush = page.evaluate("() => window.BANC_MOD.flushPendingSync()")
    record("S1", "flush online: sent=3 remaining=0", flush.get("sent") == 3 and flush.get("remaining") == 0, str(flush))

    q_after = page.evaluate("() => window.BANC_MOD.getPendingSyncEntries()")
    record("S1", "file vide après rejeu", q_after == [], str(q_after))

    # --- Retrait ciblé markSynced (milieu de file)
    ctx2, page2 = new_page(browser)
    page2.evaluate("v => window.BANC_SET_FLAG(v)", "indexeddb")
    page2.evaluate("v => window.BANC_MOD.setSyncOwnerId(v)", owner)
    marks = page2.evaluate(
        """async ([owner]) => {
          const r1 = await window.BANC_MOD.queuePendingSync('banc-entity', { ownerId: owner, n: 10 })
          const r2 = await window.BANC_MOD.queuePendingSync('banc-entity', { ownerId: owner, n: 11 })
          const r3 = await window.BANC_MOD.queuePendingSync('banc-entity', { ownerId: owner, n: 12 })
          const q = await window.BANC_MOD.getPendingSyncEntries()
          const mid = q.find(e => e.payload.n === 11)
          await window.BANC_MOD.markSynced(mid.id)
          const q2 = await window.BANC_MOD.getPendingSyncEntries()
          return { before: q.map(e => e.payload.n), after: q2.map(e => e.payload.n) }
        }""",
        [owner],
    )
    record("S1", "markSynced retire l'entrée ciblée (11) seulement",
           marks.get("before") == [10, 11, 12] and marks.get("after") == [10, 12], str(marks))
    ctx.close()
    ctx2.close()


# ---------------------------------------------------------------- S2
def s2_kill_tab_midwrite_persistent(p, server_ready):
    """S2 en contexte PERSISTANT (user_data_dir) pour survire au kill."""
    import tempfile
    owner = "banc-owner"
    with tempfile.TemporaryDirectory() as udd:
        browser = p.chromium.launch_persistent_context(udd, headless=True)
        page = browser.new_page()
        page.goto(f"{BASE}/banc", wait_until="load")
        page.wait_for_function("typeof window.BANC_MOD !== 'undefined'")
        page.evaluate("v => window.BANC_SET_FLAG(v)", "indexeddb")

        page.evaluate(
            """async () => {
              for (let i = 0; i < 10; i++)
                await window.BANC_MOD.queuePendingSync('banc-entity', { ownerId: 'banc-owner', n: i })
            }"""
        )
        base_count = page.evaluate("() => window.BANC_MOD.getPendingSyncEntries().then(l => l.length)")
        record("S2", "état initial 10 entrées", base_count == 10, str(base_count))

        # Écriture massive en vol puis kill du contexte (équivalent kill webview)
        page.evaluate(
            """() => {
              window.__BANC_WRITE = (async () => {
                const q = await window.BANC_MOD.getPendingSyncEntries()
                const huge = q.slice()
                for (let i = 0; i < 300; i++) huge.push({
                  id: 900000 + i, entity: 'banc-entity',
                  payload: { ownerId: 'banc-owner', data: 'y'.repeat(50000) },
                  createdAt: 1, operationId: 'op-' + i, ownerId: 'banc-owner' })
                const store = window.BANC_MOD.resolveQueueStore()
                return store.writeQueue(huge)
              })()
            }"""
        )
        time.sleep(0.015)
        browser.close()  # kill brutal en plein clear+put

        # Réouverture du MÊME profil persistant (nouvelle connexion IDB)
        browser2 = p.chromium.launch_persistent_context(udd, headless=True)
        page2 = browser2.new_page()
        page2.goto(f"{BASE}/banc", wait_until="load")
        page2.wait_for_function("typeof window.BANC_MOD !== 'undefined'")
        page2.evaluate("v => window.BANC_SET_FLAG(v)", "indexeddb")
        count = page2.evaluate("() => window.BANC_MOD.getPendingSyncEntries().then(l => l.length)")
        atomic = count in (10, 310)  # ancien état OU nouvel état complet — JAMAIS partiel
        record("S2", "après kill: file = ancien état (10) OU nouvel état complet (310), jamais partiel",
               atomic, f"count={count}")

        # La base reste utilisable après le kill
        ok_after = page2.evaluate(
            """async () => {
              const r = await window.BANC_MOD.queuePendingSync('banc-entity', { ownerId: 'banc-owner', n: 999 })
              return r.ok
            }"""
        )
        record("S2", "base utilisable après kill (écriture suivante ok)", ok_after is True, str(ok_after))
        browser2.close()


# ---------------------------------------------------------------- S3
def s3_upgrade_legacy(browser):
    print("S3 — upgrade avec file localStorage préexistante (import + purge après commit)")
    owner = "banc-owner"
    ctx, page = new_page(browser)
    # Pré-seed localStorage legacy (format localStorageStore historique)
    legacy = [
        {"id": 1000 + i, "entity": "banc-entity", "payload": {"ownerId": owner, "n": i},
         "createdAt": 1700000000000 + i, "operationId": f"legacy-{i}", "ownerId": owner}
        for i in range(4)
    ]
    page.evaluate(
        """([legacy]) => {
          window.localStorage.setItem('julaba-offline-queue-v1', JSON.stringify(legacy))
        }""",
        [legacy],
    )
    seed = page.evaluate("() => window.localStorage.getItem('julaba-offline-queue-v1') !== null")
    record("S3", "clé legacy préexistante en localStorage", seed is True)

    # Première ouverture IDB (flag indexeddb) → l'upgrade importe puis purge
    page.evaluate("v => window.BANC_SET_FLAG(v)", "indexeddb")
    imported = page.evaluate(
        "() => window.BANC_MOD.getPendingSyncEntries().then(l => l.map(e => e.id))"
    )
    record("S3", "4 entrées legacy importées en IDB (FIFO ids)", imported == [1000, 1001, 1002, 1003], str(imported))

    purged = page.evaluate("() => window.localStorage.getItem('julaba-offline-queue-v1')")
    record("S3", "clé legacy PURGÉE après commit", purged is None, repr(purged)[:60])

    # Idempotence : réouverture suivante → toujours 4, pas de double import
    again = page.evaluate(
        """async () => {
          const q1 = await window.BANC_MOD.getPendingSyncEntries()
          await window.BANC_MOD.queuePendingSync('banc-entity', { ownerId: 'banc-owner', n: 77 })
          const q2 = await window.BANC_MOD.getPendingSyncEntries()
          return { n1: q1.length, n2: q2.length }
        }"""
    )
    record("S3", "réouverture idempotente (4 puis 5 après 1 enfilement)",
           again.get("n1") == 4 and again.get("n2") == 5, str(again))
    ctx.close()


# ---------------------------------------------------------------- S4
def s4_quota_fallback(browser):
    print("S4 — IndexedDB indisponible / échec d'écriture : repli + contrat d'échec")
    owner = "banc-owner"

    # 4a — indexedDB ABSENT (webview ancienne) → repli transparent localStorage
    ctx, page = new_page(browser)
    page.add_init_script("delete window.indexedDB")
    page.reload(wait_until="load")  # l'init script s'applique à la PROCHAINE navigation
    page.wait_for_function("typeof window.BANC_MOD !== 'undefined'")
    page.evaluate("v => window.BANC_SET_FLAG(v)", "indexeddb")
    adapter = page.evaluate("() => window.BANC_MOD.resolveQueueStore().name")
    record("S4a", "flag indexeddb SANS IDB → repli localStorageStore", adapter == "localStorage", str(adapter))
    r = page.evaluate(
        """async ([owner]) => {
          const r = await window.BANC_MOD.queuePendingSync('banc-entity', { ownerId: owner, n: 1 })
          const q = await window.BANC_MOD.getPendingSyncEntries()
          return { ok: r.ok, n: q.length }
        }""",
        [owner],
    )
    record("S4a", "enfilement fonctionnel via repli", r.get("ok") is True and r.get("n") == 1, str(r))
    ctx.close()

    # 4c — abort async de transaction (forme réelle d'une erreur quota commit)
    #      → persistAll=false → {ok:false} + file précédente INTACTE
    ctx2, page2 = new_page(browser)
    page2.evaluate("v => window.BANC_SET_FLAG(v)", "indexeddb")
    page2.evaluate("v => window.BANC_MOD.setSyncOwnerId(v)", owner)
    page2.evaluate(
        """async ([owner]) => {
          for (let i = 0; i < 5; i++)
            await window.BANC_MOD.queuePendingSync('banc-entity', { ownerId: owner, n: i })
        }""",
        [owner],
    )
    page2.evaluate(
        """() => {
          const origClear = IDBObjectStore.prototype.clear
          window.__ORIG_CLEAR = origClear
          IDBObjectStore.prototype.clear = function () {
            const r = origClear.call(this)
            const tx = this.transaction
            queueMicrotask(() => { try { tx.abort() } catch {} })
            return r
          }
        }"""
    )
    res = page2.evaluate(
        """async () => {
          try {
            const r = await window.BANC_MOD.queuePendingSync('banc-entity', { ownerId: 'banc-owner', n: 666 })
            return { kind: 'result', r }
          } catch (e) {
            return { kind: 'rejet', message: String(e) }
          }
        }"""
    )
    record("S4c", "abort commit (forme quota) → résultat {ok:false} SANS crash",
           res.get("kind") == "result" and res.get("r", {}).get("ok") is False, str(res)[:120])
    page2.evaluate("() => { IDBObjectStore.prototype.clear = window.__ORIG_CLEAR }")
    intact = page2.evaluate(
        "() => window.BANC_MOD.getPendingSyncEntries().then(l => ({ n: l.length, first: l[0] && l[0].payload.n }))"
    )
    record("S4c", "file précédente INTACTE après échec (5 entrées, rollback)",
           intact.get("n") == 5 and intact.get("first") == 0, str(intact))
    usable = page2.evaluate(
        """async () => {
          const r = await window.BANC_MOD.queuePendingSync('banc-entity', { ownerId: 'banc-owner', n: 55 })
          return { ok: r.ok, n: (await window.BANC_MOD.getPendingSyncEntries()).length }
        }"""
    )
    record("S4c", "écriture suivante fonctionnelle (récupération)", usable.get("ok") is True and usable.get("n") == 6, str(usable))
    ctx2.close()


# ---------------------------------------------------------------- S5
def s5_concurrency(browser):
    print("S5 — concurrence Web Locks × IDB (0 perte)")
    owner = "banc-owner"

    # 5a — 50 enfilements CONCURRENTS dans une page
    ctx, page = new_page(browser)
    page.evaluate("v => window.BANC_SET_FLAG(v)", "indexeddb")
    conc = page.evaluate(
        """async ([owner]) => {
          window.BANC_MOD.setSyncOwnerId(owner)
          const jobs = []
          for (let i = 0; i < 50; i++)
            jobs.push(window.BANC_MOD.queuePendingSync('banc-entity', { ownerId: owner, n: i }))
          const rs = await Promise.all(jobs)
          const q = await window.BANC_MOD.getPendingSyncEntries()
          const ns = q.map(e => e.payload.n)
          return { okAll: rs.every(r => r.ok), count: q.length,
                   unique: new Set(ns).size === q.length,
                   fifo: ns.every((v, i) => i === 0 || ns[i - 1] < v) }
        }""",
        [owner],
    )
    record("S5a", "50 enfilements concurrents: tous ok, 50 uniques, FIFO stricte",
           conc.get("okAll") is True and conc.get("count") == 50 and conc.get("unique") is True and conc.get("fifo") is True,
           str(conc))
    ctx.close()

    # 5b — 2 ONGLETS réels (mêmes Web Locks, même IDB) : 30 chacun, 60 attendus
    ctx2 = browser.new_context()
    p1 = ctx2.new_page()
    p2 = ctx2.new_page()
    for pg in (p1, p2):
        pg.goto(f"{BASE}/banc", wait_until="load")
        pg.wait_for_function("typeof window.BANC_MOD !== 'undefined'")
        pg.evaluate("v => window.BANC_SET_FLAG(v)", "indexeddb")
    counts = p1.evaluate(
        """async () => {
          window.BANC_MOD.setSyncOwnerId('banc-owner')
          const jobs = []
          for (let i = 0; i < 30; i++)
            jobs.push(window.BANC_MOD.queuePendingSync('banc-tab1', { ownerId: 'banc-owner', n: i }))
          const rs = await Promise.all(jobs)
          return rs.filter(r => r.ok).length
        }"""
    )
    counts2 = p2.evaluate(
        """async () => {
          window.BANC_MOD.setSyncOwnerId('banc-owner')
          const jobs = []
          for (let i = 0; i < 30; i++)
            jobs.push(window.BANC_MOD.queuePendingSync('banc-tab2', { ownerId: 'banc-owner', n: i }))
          const rs = await Promise.all(jobs)
          return rs.filter(r => r.ok).length
        }"""
    )
    total = p1.evaluate(
        "() => window.BANC_MOD.getPendingSyncEntries().then(l => ({ t: l.length, u: new Set(l.map(e => e.id)).size }))"
    )
    record("S5b", "2 onglets × 30 enfilements → 60 entrées uniques (0 écrasement)",
           counts == 30 and counts2 == 30 and total.get("t") == 60 and total.get("u") == 60,
           f"tab1={counts} tab2={counts2} total={total}")
    ctx2.close()


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()

    exit_code = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ua = browser.new_context().new_page()
        ua.goto(f"{BASE}/banc", wait_until="load")
        chrome = ua.evaluate("navigator.userAgent")
        record("ENV", "Chromium réel chargé (module banc.bundle.js présent)", True, chrome[:80])
        ua.context.close()

        try:
            s1_offline_replay(browser)
            s3_upgrade_legacy(browser)
            s4_quota_fallback(browser)
            s5_concurrency(browser)
            s2_kill_tab_midwrite_persistent(p, srv)
        finally:
            browser.close()

    srv.shutdown()

    print("\n===== BILAN =====")
    fails = [r for r in RESULTS if not r["ok"]]
    print(f"{len(RESULTS) - len(fails)}/{len(RESULTS)} vérifications PASS")
    for r in fails:
        print(f"  FAIL [{r['scenario']}] {r['check']} — {r['detail']}")
        exit_code = 1
    Path(DIR / "banc-results.json").write_text(json.dumps(RESULTS, indent=2, ensure_ascii=False))
    print(f"Résultats: {DIR / 'banc-results.json'}")
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
