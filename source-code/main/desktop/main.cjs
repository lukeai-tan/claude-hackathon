'use strict';
const {protocol}=require('electron');
protocol.registerSchemesAsPrivileged([{scheme:'opensuite',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
process.env.OPENSUITE_MODE='1';
// OpenSlides owns its renderer bridge and Anthropic key handling. Reuse the
// Electron runtime; the suite does not ship a second Chromium installation.
require('../../OpenSlides/desktop/main.cjs');
