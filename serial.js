var serial = {};

(function() {
  'use strict';

  serial.getPorts = function() {
    return navigator.usb.getDevices().then(devices => {
      return devices.map(device => new serial.Port(device));
    });
  };

  serial.requestPort = function() {
    const filters = [
      { 'vendorId': 0x2341, 'productId': 0x8036 }, // Arduino Leonardo
      { 'vendorId': 0x2341, 'productId': 0x8037 }, // Arduino Micro
      { 'vendorId': 0x239A }, // Adafruit Boards
    ];
    return navigator.usb.requestDevice({ 'filters': filters }).then(
      device => new serial.Port(device)
    );
  };

  serial.Port = function(device) {
    this.device_ = device;
    this.interfaceNumber_ = 2;
    this.endpointIn_ = 5;
    this.endpointOut_ = 4;

    // ここでデフォルトの空関数として定義しておく
    this.onReceive = function(data) {};
    this.onReceiveError = function(error) {};
  };

  serial.Port.prototype.connect = function() {
    let readLoop = () => {
      this.device_.transferIn(this.endpointIn_, 64).then(result => {
        this.onReceive(result.data);
        readLoop();
      }, error => {
        this.onReceiveError(error);
      });
    };

    return this.device_.open()
      .then(() => {
        if (this.device_.configuration === null) {
          return this.device_.selectConfiguration(1);
        }
      })
      .then(() => {
        var configurationInterfaces = this.device_.configuration.interfaces;
        configurationInterfaces.forEach(element => {
          element.alternates.forEach(elementalt => {
            if (elementalt.interfaceClass == 0xff) {
              this.interfaceNumber_ = element.interfaceNumber;
              elementalt.endpoints.forEach(elementendpoint => {
                if (elementendpoint.direction == "out") {
                  this.endpointOut_ = elementendpoint.endpointNumber;
                }
                if (elementendpoint.direction == "in") {
                  this.endpointIn_ = elementendpoint.endpointNumber;
                }
              });
            }
          });
        });
      })
      .then(() => this.device_.claimInterface(this.interfaceNumber_))
      .then(() => this.device_.selectAlternateInterface(this.interfaceNumber_, 0))
      .then(() => this.device_.controlTransferOut({
        'requestType': 'class',
        'recipient': 'interface',
        'request': 0x22,
        'value': 0x01,
        'index': this.interfaceNumber_
      }))
      .then(() => {
        readLoop();
      });
  };

  serial.Port.prototype.disconnect = function() {
    return this.device_.controlTransferOut({
      'requestType': 'class',
      'recipient': 'interface',
      'request': 0x22,
      'value': 0x00,
      'index': this.interfaceNumber_
    })
    .then(() => this.device_.close());
  };

  serial.Port.prototype.send = function(data) {
    return this.device_.transferOut(this.endpointOut_, data);
  };

})();
