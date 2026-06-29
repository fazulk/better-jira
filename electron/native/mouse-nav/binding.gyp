{
  "targets": [
    {
      "target_name": "mouse_nav",
      "conditions": [
        ["OS=='mac'", {
          "sources": ["mouse-nav.mm"],
          "include_dirs": [
            "<!@(node -p \"require('node-addon-api').include_dir\")"
          ],
          "defines": ["NAPI_VERSION=8"],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "MACOSX_DEPLOYMENT_TARGET": "11.0",
            "OTHER_CFLAGS": ["-ObjC++"]
          },
          "link_settings": {
            "libraries": ["-framework AppKit"]
          }
        }]
      ]
    }
  ]
}
