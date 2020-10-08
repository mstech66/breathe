const storage = require('electron-json-storage');
const os = require('os');

storage.setDataPath(os.tmpdir());

function saveProcessId(pid) {
    let data = {};
    data['pid'] = pid;
    storage.set('pid', data, (err) => { if (err) console.log(err); });
}

function doesDataExist(callback) {
    storage.has('pid', (err, hasKey) => {
        if (err) console.log(err);

        if (hasKey) {
            console.log("****It has pid!!!****");
            callback(true);
        }
        else {
            console.log("****No PID at all!****");
            callback(false);
        }
    });
}

function getProcessId(callback) {
    storage.get('pid', (err, data) => {
        if (err) console.log(err);
        console.log(`pid is ${data.pid} and type is ${typeof data.pid}`);
        callback(data.pid);
    });
}

function clearStorage() {
    storage.clear((err) => {
        if (err) console.log(err);
        console.log("Cleared Storage!");
    });
}

module.exports = {
    saveProcessId, getProcessId, clearStorage, doesDataExist
}
