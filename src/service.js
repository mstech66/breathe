const { exec } = require('child_process');
const schedule = require('node-schedule');

var args = process.argv; //['electron.exe', 'script', 'seconds']

callReminder(Number(args[2]));

function showNotification() {
  exec("npm run ps");
}

function callReminder(seconds) {
  schedule.scheduleJob(`*/${seconds} * * * * *`, function () {
    showNotification();
  });
}