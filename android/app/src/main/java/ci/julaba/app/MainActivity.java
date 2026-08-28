package ci.julaba.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // SherpaSttPlugin is a local plugin (not published to npm), so it
        // needs manual registration — Capacitor's autolinking only covers
        // plugins that ship their own npm package. See SherpaSttPlugin.java.
        registerPlugin(SherpaSttPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
