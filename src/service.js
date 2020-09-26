let { Service } = require('node-windows');
const path = require('path')

let svc = new Service({
    name: "Breathe",
    description: "Breathe Service",
    script: "D:\\Projects\\breathe\\build\\notification.js"
});

svc.on('install', function () {
    svc.start();
});

svc.install();