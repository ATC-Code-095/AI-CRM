package com.itecent.crm;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 本地插件须在 super.onCreate 之前注册
        registerPlugin(CrmAppPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
