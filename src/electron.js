const { app, BrowserWindow } = require('electron')
const { exec } = require('child_process');
const express = require('express');
const appExpress = express();
var bodyParser = require('body-parser');
appExpress.use(bodyParser.json({ limit: '50mb' }));
appExpress.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));
const forever = require('forever-monitor');
let script;

function startJob(seconds) {
  script = new (forever.Monitor)('src/service.js', {
    args: [seconds]
  });
  script.start();
}

appExpress.listen(5000, function () {
  console.log("Server Listening on 5000");
});

appExpress.get('/', function (req, res) {
  res.status(200).send();
});

appExpress.post('/reminder', function (req, res, next) {
  let seconds = Number(req.body.mins) * 60;
  startJob(seconds);
  res.status(200).send();
});

appExpress.post('/stopReminders', function(req, res, next) {
  
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false
    }
  })

  // mainWindow.setMenu(null);

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
