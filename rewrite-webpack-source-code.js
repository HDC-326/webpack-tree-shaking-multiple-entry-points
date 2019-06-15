const fs = require('fs-extra');
const path = require('path');

fs.copySync(path.resolve('webpack'), path.resolve('node_modules/webpack/lib'));