const path = require('path');
const serverDir = path.join(__dirname, '..', 'server');
process.chdir(serverDir);
require(path.join(serverDir, 'scripts', 'make_vone_call.js'));
