const { exec } = require('child_process');
const schedule = require('node-schedule');

var args = process.argv; //['electron.exe', 'script', 'seconds']

callReminder(Number(args[2]));

var pid;

function showNotification() {
  let cmd_exec = exec("npm run ps");
  pid = cmd_exec.pid;
  console.log("Process Id is "+ pid);
}

function callReminder(seconds) {
  schedule.scheduleJob(`*/${seconds} * * * * *`, function () {
    showNotification();
  });
}

function stopReminders(){
  process.kill(-pid);
}
