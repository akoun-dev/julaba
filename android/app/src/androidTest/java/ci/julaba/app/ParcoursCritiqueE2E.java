package ci.julaba.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.core.app.ActivityScenario;
import com.getcapacitor.BridgeActivity;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * MODE-1013 / banc WF7 (volet C) — suite E2E « parcours critique » sur
 * appareil réel, dans la WebView Capacitor (moteur réel de l'app hybride
 * remote : la page testée EST l'app servie par le serveur déployé).
 *
 * Périmètre (design MODE-1012, MODE-1010-ter) : les contrats de la couche
 * stockage/synchronisation qui décident de la bascule IndexedDB — contexte
 * sécurisé de la webview, persistance FIFO de la file, Web Locks réels,
 * Background Sync réel (seule la webview Android le supporte vraiment).
 *
 * ISOLEMENT STRICT : la suite n'écrit JAMAIS dans la file réelle de
 * l'appareil (julaba-offline). Elle utilise une base dédiée
 * « julaba-offline-banc » créée/supprimée par chaque test — le parcours
 * métier auth PIN → vente → offline → rejeu sur la VRAIE file reste le
 * volet A manuel du runbook .ai/BANC-WF7-PHYSIQUE.md (l'appareil y est
 * piloté à la main, la preuve serveur est faite côté base hébergée).
 *
 * Exécution (machine avec SDK Android + appareil branché) :
 *   cd android && ./gradlew connectedAndroidTest
 * Rapport : android/app/build/outputs/androidTest-results/
 */
@RunWith(AndroidJUnit4.class)
public class ParcoursCritiqueE2E {

    private static final long ATTENTE_CHARGEMENT_S = 60;
    private static final String DB_BANC = "julaba-offline-banc";

    private ActivityScenario<MainActivity> scenario;
    private WebView webView;

    @Before
    public void lanceAppEtAttendChargement() throws Exception {
        // MainActivity est la SEULE activité déclarée dans le manifest —
        // BridgeActivity (sa classe de base) ne se lance pas seule.
        scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(activity ->
            webView = ((BridgeActivity) activity).getBridge().getWebView());
        assertNotNull("WebView Capacitor introuvable", webView);

        // La page distante (serveur déployé) doit être chargée avant toute
        // injection : progress == 100 ET document.readyState == 'complete'.
        long echeance = System.currentTimeMillis() + ATTENTE_CHARGEMENT_S * 1000;
        while (System.currentTimeMillis() < echeance) {
            String readyState = evalJs("document.readyState");
            if (webView.getProgress() == 100 && "\"complete\"".equals(readyState)) {
                return;
            }
            Thread.sleep(500);
        }
        throw new AssertionError("WebView non chargée en " + ATTENTE_CHARGEMENT_S + " s");
    }

    @After
    public void nettoie() throws Exception {
        // La base banc est supprimée quelle que soit l'issue du test.
        evalJs("(async () => { await indexedDB.deleteDatabase('" + DB_BANC + "'); return true; })()");
        if (scenario != null) {
            scenario.close();
        }
    }

    // ------------------------------------------------------------- T1
    @Test
    public void t1_webviewContexteSecuriseEtApisRequises() throws Exception {
        String json = evalJs(
            "(async () => {" +
            "  let swActif = false;" +
            "  if ('serviceWorker' in navigator) {" +
            "    const reg = await Promise.race([" +
            "      navigator.serviceWorker.ready," +
            "      new Promise(r => setTimeout(() => r(null), 15000))]);" +
            "    swActif = !!(reg && reg.active);" +
            "  }" +
            "  return JSON.stringify({" +
            "    idb: typeof indexedDB !== 'undefined'," +
            "    locks: !!(navigator.locks && typeof navigator.locks.request === 'function')," +
            "    sw: 'serviceWorker' in navigator," +
            "    swActif: swActif," +
            "    securise: window.isSecureContext" +
            "  });" +
            "})()");
        assertChamp(json, "idb", true);
        assertChamp(json, "locks", true);
        assertChamp(json, "sw", true);
        assertChamp(json, "swActif", true);
        assertChamp(json, "securise", true);
    }

    // ------------------------------------------------------------- T2
    @Test
    public void t2_filePersisteAuRedemarrageWebviewAvecFifo() throws Exception {
        // Seed dans la base DÉDIÉE (jamais la file réelle) : 3 entrées au
        // format PendingSyncEntry exact (id monotone = clé primaire → FIFO).
        String seedJson = evalJs(
            "(async () => {" +
            "  const db = await new Promise((res, rej) => {" +
            "    const r = indexedDB.open('" + DB_BANC + "', 1);" +
            "    r.onupgradeneeded = () => r.result.createObjectStore('queue', { keyPath: 'id' });" +
            "    r.onsuccess = () => res(r.result);" +
            "    r.onerror = () => rej(r.error);" +
            "  });" +
            "  const entrees = [990000000001, 990000000002, 990000000003].map((id, i) => ({" +
            "    id: id, entity: 'banc-e2e'," +
            "    payload: { ownerId: 'banc-e2e', n: i, data: 'x'.repeat(1024) }," +
            "    createdAt: id, operationId: 'banc-e2e-' + i, ownerId: 'banc-e2e'" +
            "  }));" +
            "  await new Promise((res, rej) => {" +
            "    const tx = db.transaction('queue', 'readwrite');" +
            "    entrees.forEach(e => tx.objectStore('queue').put(e));" +
            "    tx.oncomplete = () => res(true);" +
            "    tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);" +
            "  });" +
            "  return JSON.stringify({ ok: true, version: db.version });" +
            "})()");
        assertChamp(seedJson, "ok", true);

        // Redémarrage DU PROCESSUS WEBVIEW (reload de la page distante) —
        // l'IndexedDB doit survivre avec le FIFO intact (getAll trie par
        // clé primaire).
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> webView.reload());
        long echeance = System.currentTimeMillis() + ATTENTE_CHARGEMENT_S * 1000;
        while (System.currentTimeMillis() < echeance) {
            String readyState = evalJs("document.readyState");
            if (webView.getProgress() == 100 && "\"complete\"".equals(readyState)) break;
            Thread.sleep(500);
        }

        String lecture = evalJs(
            "(async () => {" +
            "  const db = await new Promise((res, rej) => {" +
            "    const r = indexedDB.open('" + DB_BANC + "', 1);" +
            "    r.onsuccess = () => res(r.result);" +
            "    r.onerror = () => rej(r.error);" +
            "  });" +
            "  const all = await new Promise((res, rej) => {" +
            "    const tx = db.transaction('queue', 'readonly');" +
            "    const rq = tx.objectStore('queue').getAll();" +
            "    rq.onsuccess = () => res(rq.result);" +
            "    tx.onerror = () => rej(tx.error);" +
            "  });" +
            "  const banc = all.filter(e => e.entity === 'banc-e2e');" +
            "  return JSON.stringify({ ids: banc.map(e => e.id), total: banc.length });" +
            "})()");
        assertChamp(lecture, "ids", "[990000000001,990000000002,990000000003]");
        assertChamp(lecture, "total", 3);
    }

    // ------------------------------------------------------------- T3
    @Test
    public void t3_backgroundSyncEnregistrableSurWebviewAndroid() throws Exception {
        // MODE-1011 : la webview Android est la SEULE plateforme où le
        // Background Sync existe réellement — le tag julaba-flush doit
        // s'enregistrer et le SW servi doit être sw.js du serveur déployé.
        String json = evalJs(
            "(async () => {" +
            "  if (!('serviceWorker' in navigator)) return JSON.stringify({ ok: false });" +
            "  const reg = await Promise.race([" +
            "    navigator.serviceWorker.ready," +
            "    new Promise(r => setTimeout(() => r(null), 15000))]);" +
            "  if (!reg || !reg.sync) return JSON.stringify({ ok: false });" +
            "  try {" +
            "    await reg.sync.register('julaba-flush');" +
            "    const script = reg.active ? reg.active.scriptURL : '';" +
            "    return JSON.stringify({ ok: true, script: script });" +
            "  } catch (e) { return JSON.stringify({ ok: false, err: String(e) }); }" +
            "})()");
        assertChamp(json, "ok", true);
        assertTrue("SW servi ≠ sw.js : " + json, json.contains("sw.js"));
    }

    // ------------------------------------------------------------- T4
    @Test
    public void t4_webLocksSerialisentReellementSurAppareil() throws Exception {
        // MODE-1005 : deux sections critiques concurrentes sous le même
        // verrou doivent se sérialiser (B ne s'exécute qu'après A-out).
        String json = evalJs(
            "(async () => {" +
            "  const ordre = [];" +
            "  await navigator.locks.request('banc-e2e-verrou', async () => {" +
            "    ordre.push('A-in');" +
            "    const p = navigator.locks.request('banc-e2e-verrou', async () => ordre.push('B-in'));" +
            "    await new Promise(r => setTimeout(r, 150));" +
            "    ordre.push('A-out');" +
            "    await p;" +
            "  });" +
            "  return JSON.stringify({ ordre: ordre.join(',') });" +
            "})()");
        assertEquals("Sérialisation Web Locks absente sur la webview : " + json,
            "A-in,A-out,B-in", json.replace("\\\"", "").replace("\"", "").replace("{", "").replace("}", "").replace("ordre:", "").trim());
    }

    // ------------------------------------------------------------ outils

    /** Évalue du JS dans la webview (thread UI) et attend la valeur —
     * evaluateJavascript résout les Promise natives (webview Chromium). */
    private String evalJs(final String js) throws Exception {
        final AtomicReference<String> resultat = new AtomicReference<>();
        final CountDownLatch latch = new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            webView.evaluateJavascript(js, valeur -> {
                resultat.set(valeur);
                latch.countDown();
            }));
        assertTrue("evaluateJavascript sans réponse en 30 s", latch.await(30, TimeUnit.SECONDS));
        return resultat.get() == null ? "" : resultat.get().trim();
    }

    /** Vérifie un champ booléen/numérique dans la sortie JSON minifiée de
     * evaluateJavascript (échappements webview gérés par contains). */
    private static void assertChamp(String json, String champ, Object attendu) {
        String brut = json.replace("\"", "");
        String attenduBrut = String.valueOf(attendu).replace("\"", "");
        assertTrue("attendu " + champ + "=" + attenduBrut + " dans " + json,
            brut.contains(champ + ":" + attenduBrut));
    }
}
