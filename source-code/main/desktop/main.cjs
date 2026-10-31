'use strict';
process.env.OPENSUITE_MODE='1';
// The shared entry point registers both app protocols in one pre-ready call.
require('../../OpenSlides/desktop/main.cjs');
