const { app, BrowserWindow } = require('electron')
const { exec } = require('child_process');
const express = require('express');
const appExpress = express();
var bodyParser = require('body-parser');
appExpress.use(bodyParser.json({ limit: '50mb' }));
appExpress.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));
const pm2 = require('pm2');

function startJob(mins) {
  pm2.start({ name: 'breathe', script: 'src/service.js', args: [mins] }, function (err, proc) { });
}

function stopJob() {
  pm2.stop('breathe', function (err, proc) { })
}

appExpress.listen(5000, function () {
  console.log("Server Listening on 5000");
});

appExpress.get('/', function (req, res) {
  res.status(200).send();
});

appExpress.post('/reminder', function (req, res, next) {
  let mins = Number(req.body.mins);
  startJob(mins);
  res.status(200).send();
});

appExpress.post('/stop', function (req, res, next) {
  stopJob();
  res.status(200).send();
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false
    },
    resizable: false
  })

  mainWindow.setMenu(null);
  mainWindow.loadFile('src/view/index.html');
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})