const { exec } = require('child_process');
const schedule = require('node-schedule');

var args = process.argv; //['electron.exe', 'script', 'seconds']

callReminder(Number(args[2]));

function showNotification() {
  exec("npm run ps", { windowsHide: true, detached: true });
}

function callReminder(minutes) {
  let output = `*/${minutes} * * * *`;

  if (minutes >= 60) {
    let hour = minutes / 60;
    let mins = minutes % 60;
    output = `*/${mins} ${hour} * * *`;
  }
  schedule.scheduleJob(output, function () {
    showNotification();
  });
}