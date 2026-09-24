import importlib
import os
import os.path
import site
import sys
import time

_vc_boot_start_ms = int(time.monotonic() * 1000)
_here = os.path.dirname(__file__)

os.environ.update({
  "__VC_PY_BOOT_START_MS": str(_vc_boot_start_ms),
  "__VC_HANDLER_MODULE_NAME": "api.trustwatch",
  "__VC_HANDLER_ENTRYPOINT": "api/trustwatch.py",
  "__VC_HANDLER_ENTRYPOINT_ABS": os.path.join(_here, "api/trustwatch.py"),
  "__VC_HANDLER_VENDOR_DIR": "_vendor",
  "__VC_HANDLER_VARIABLE_NAME": "handler"
})

_vendor_rel = '_vendor'
_vendor = os.path.normpath(os.path.join(_here, _vendor_rel))

if os.path.isdir(_vendor):
    site.addsitedir(_vendor)
    try:
        while _vendor in sys.path:
            sys.path.remove(_vendor)
    except ValueError:
        pass
    idx = 1 if (sys.path and sys.path[0] in ('', _here)) else 0
    sys.path.insert(idx, _vendor)

importlib.invalidate_caches()

from vercel_runtime.vc_init import vc_handler
