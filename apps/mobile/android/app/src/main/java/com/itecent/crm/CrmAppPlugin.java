package com.itecent.crm;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 网页侧在注册推送前查询：打包时是否放了 google-services.json（Firebase 已配置）。
 * 未配置时调用 PushNotifications.register() 会让 App 崩溃，所以网页据此跳过推送注册。
 * google-services 插件会把配置生成为字符串资源 google_app_id，据此判断。
 */
@CapacitorPlugin(name = "CrmApp")
public class CrmAppPlugin extends Plugin {

    @PluginMethod
    public void pushReady(PluginCall call) {
        Context ctx = getContext();
        int id = ctx.getResources().getIdentifier("google_app_id", "string", ctx.getPackageName());
        JSObject ret = new JSObject();
        ret.put("ready", id != 0);
        call.resolve(ret);
    }
}
