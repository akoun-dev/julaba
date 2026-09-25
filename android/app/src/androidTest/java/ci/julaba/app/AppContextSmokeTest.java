package ci.julaba.app;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * AUDIT-012 P1-11 — remplace le template Capacitor (package
 * com.getcapacitor.myapp, assertion « com.getcapacitor.app ») qui ne
 * validait JAMAIS le package réellement livré. Smoke test natif : le
 * contexte d'instrumentation porte bien le package applicatif ci.julaba.app.
 * (Exécution sur appareil/émulateur : connectedAndroidTest — la CI sans
 * appareil ne l'exécute pas, mais le test n'est plus orphelin.)
 */
@RunWith(AndroidJUnit4.class)
public class AppContextSmokeTest {

    @Test
    public void leContextePorteLePackageApplicatif() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("ci.julaba.app", appContext.getPackageName());
    }
}
