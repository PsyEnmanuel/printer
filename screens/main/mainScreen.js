const electronReload = require('electron-reload')
const { app, BrowserWindow, ipcMain, globalShortcut } = require("electron");
const path = require("path");

class MainScreen {
  window;

  position = {
    width: 1000,
    height: 600,
    maximized: true,
  };
  constructor() {
    this.window = new BrowserWindow({
      width: this.position.width,
      height: this.position.height,
      title: "This is a test application",
      show: false,
      removeMenu: true,
      acceptFirstMouse: true,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "./mainPreload.js"),
      },
    });

    this.window.once("ready-to-show", () => {
      this.window.show();

      if (this.position.maximized) {
        this.window.maximize();
      }
    });

    this.handleMessages();

    // let wc = this.window.webContents;
    // wc.openDevTools({ mode: "right" });

    this.window.loadFile("./screens/main/main.html");
  }

  showMessage(message) {
    // this.window.webContents.send("updateMessage", message);
  }

  close() {
    this.window.close();
    ipcMain.removeAllListeners();
  }

  hide() {
    this.window.hide();
  }

  handleMessages() {
    //Ipc functions go here.
  }
}

module.exports = MainScreen;
