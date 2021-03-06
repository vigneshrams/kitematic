var fs = require('fs');
var exec = require('exec');
var path = require('path');
var async = require('async');

VirtualBox = {};

VirtualBox.REQUIRED_VERSION = '4.3.18';
VirtualBox.INCLUDED_VERSION = '4.3.18';
VirtualBox.INSTALLER_FILENAME = 'virtualbox-4.3.18.pkg';
VirtualBox.INSTALLER_CHECKSUM = '5836c94481c460c648b9216386591a2915293ac86b9bb6c57746637796af6af2'; // Sha256 Checksum

VirtualBox.installed = function () {
  return fs.existsSync('/usr/bin/VBoxManage') &&
    fs.existsSync('/Applications/VirtualBox.app/Contents/MacOS/VirtualBox');
};

VirtualBox.exec = function (command, callback) {
  exec('/usr/bin/VBoxManage ' + command, function (stderr, stdout, code) {
    callback(stderr, stdout, code);
  });
};

VirtualBox.install = function (callback) {
  // -W waits for the process to close before finishing.
  exec('open -W ' + path.join(Util.getResourceDir(), this.INSTALLER_FILENAME).replace(' ', '\\ '), function (stderr, stdout, code) {
    if (code) {
      callback(stderr);
      return;
    }
    callback(null);
  });
};

VirtualBox.version = function (callback) {
  if (!this.installed()) {
    callback('VirtualBox not installed.');
    return;
  }
  this.exec('-v', function (stderr, stdout, code) {
    if (code) {
      callback(stderr);
      return;
    }
    // Output is x.x.xryyyyyy
    var match = stdout.match(/(\d+\.\d+\.\d+).*/);
    if (!match || match.length < 2) {
      callback('VBoxManage -v output format not recognized.');
      return;
    }
    callback(null, match[1]);
  });
};

VirtualBox.saveRunningVMs = function (callback) {
  if (!this.installed()) {
    callback('VirtualBox not installed.');
    return;
  }
  this.exec('list runningvms | sed -E \'s/.*\\{(.*)\\}/\\1/\' | xargs -L1 -I {} VBoxManage controlvm {} savestate', function (stderr, stdout, code) {
    if (code) {
      callback(stderr);
    } else {
      callback();
    }
  });
};

VirtualBox.killAllProcesses = function (callback) {
  this.saveRunningVMs(function (err) {
    if (err) {callback(err); return;}
    exec('pkill VirtualBox', function (stderr, stdout, code) {
      if (code) {callback(stderr); return;}
      exec('pkill VBox', function (stderr, stdout, code) {
        if (code) {callback(stderr); return;}
        callback();
      });
    });
  });
};

VirtualBox.vmState = function (name, callback) {
  VirtualBox.exec('showvminfo ' + name + ' --machinereadable', function (stderr, stdout, code) {
    if (code) { callback(stderr); return; }
    var match = stdout.match(/VMState="(\w+)"/);
    if (!match) {
      callback('Could not parse VMState');
      return;
    }
    callback(null, match[1]);
  });
};

VirtualBox.shutdownVM = function (name, callback) {
  VirtualBox.vmState(name, function (err, state) {
    // No VM found
    if (err) { callback(null, false); return; }
    VirtualBox.exec('controlvm ' + name + ' acpipowerbutton', function (stderr, stdout, code) {
      if (code) { callback(stderr, false); return; }
      var state = null;

      async.until(function () {
        return state === 'poweroff';
      }, function (callback) {
        VirtualBox.vmState(name, function (err, newState) {
          if (err) { callback(err); return; }
          state = newState;
          setTimeout(callback, 250);
        });
      }, function (err) {
        VirtualBox.exec('unregistervm ' + name + ' --delete', function (stderr, stdout, code) {
          if (code) { callback(err); return; }
          callback();
        });
      });
    });
  });
};
