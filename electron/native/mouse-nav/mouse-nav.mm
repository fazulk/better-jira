// Native macOS mouse back/forward button monitor.
//
// macOS does not deliver mouse buttons 4/5 (the side back/forward buttons) to
// Electron's web contents, and `app-command` is Windows/Linux only — so the
// buttons are completely invisible to JavaScript (no DOM event, no app-command).
// Chrome/Safari work because they handle the raw NSEvent natively; this addon
// does the same for our app.
//
// A *local* monitor (not a global one) only sees events already being dispatched
// to our own application, so it needs no Accessibility / Input Monitoring
// permission. The handler runs on the main thread; we marshal the button press
// onto the JS thread via a ThreadSafeFunction.
#include <napi.h>
#import <AppKit/AppKit.h>

namespace {
id g_monitor = nil;
Napi::ThreadSafeFunction g_tsfn;
bool g_running = false;
}

Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (g_running) {
    return env.Undefined();
  }
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "start(callback) requires a function")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  g_tsfn = Napi::ThreadSafeFunction::New(
      env, info[0].As<Napi::Function>(), "mouseNavMonitor", 0, 1);
  g_running = true;

  g_monitor = [NSEvent
      addLocalMonitorForEventsMatchingMask:NSEventMaskOtherMouseDown
                                   handler:^NSEvent*(NSEvent* event) {
                                     int code = (int)[event buttonNumber];
                                     g_tsfn.NonBlockingCall(
                                         [code](Napi::Env env,
                                                Napi::Function jsCallback) {
                                           jsCallback.Call(
                                               {Napi::Number::New(env, code)});
                                         });

                                     // Pass every side-button press through to
                                     // JS; main decides which navigate and
                                     // whether to swallow it.
                                     return event;
                                   }];

  return env.Undefined();
}

Napi::Value Stop(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!g_running) {
    return env.Undefined();
  }
  if (g_monitor != nil) {
    [NSEvent removeMonitor:g_monitor];
    g_monitor = nil;
  }
  g_tsfn.Release();
  g_running = false;

  return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  return exports;
}

NODE_API_MODULE(mouse_nav, Init)
