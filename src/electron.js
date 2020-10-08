const { app, BrowserWindow } = require('electron')
const express = require('express');
const appExpress = express();
var bodyParser = require('body-parser');
appExpress.use(bodyParser.json({ limit: '50mb' }));
appExpress.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));
const forever = require('forever-monitor');
let script;
const { saveProcessId, getProcessId, clearStorage, doesDataExist } = require('./storage');

function startJob(mins) {
  doesDataExist((status) => {
    if (status === true) {
      getProcessId(killProcess);
    }
    script = new (forever.Monitor)('src/service.js', {
      args: [mins]
    });
    script.start();
    script.on('start', function () {
      console.log(`script has started and I am sending this one ${script.childData.pid}`);
      saveProcessId(script.childData.pid);
    });
  });
}

function killProcess(pid) {
  console.log("In killProcess function with pid: " + pid);
  try {
    process.kill(pid);
  } catch (error) {
    console.log("No process to kill");
  }
  finally {
    clearStorage();
  }
}

function stopJob() {
  getProcessId(killProcess);
}

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

  appExpress.listen(7070, function () {
    console.log("Server Listening on 7070");
  });
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
