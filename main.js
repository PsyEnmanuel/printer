const { app, BrowserWindow, ipcMain, ipcRenderer, Tray, Menu } = require("electron");
const MainScreen = require("./screens/main/mainScreen");
const Globals = require("./globals");
const { autoUpdater, AppUpdater } = require("electron-updater");
const io = require("socket.io-client");
const printer = require('pdf-to-printer');
const AutoLaunch = require('auto-launch');
const axios = require("axios");
const path = require("path");
const fs = require("fs");

let curWindow;
let socket;
let tray = null;


let appLauncher = new AutoLaunch({
  name: 'saonas-printer',
  path: process.execPath,
  args: ['--auto-launch'],
  isHidden: false
});

// Enable auto-launch
appLauncher.isEnabled().then((isEnabled) => {
  if (!isEnabled) {
    appLauncher.enable();
  }
}).catch((err) => {
  console.error('Error enabling auto-launch:', err);
});

//Basic flags
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
  curWindow = new MainScreen();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length == 0) createWindow();
  });

  autoUpdater.checkForUpdates();

  curWindow.window.on('close', (event) => {
    event.preventDefault();  // Prevent the window from being closed
    curWindow.window.hide();       // Hide the window instead
  });

  curWindow.window.on('closed', () => {
    curWindow.window = null;
  });

  curWindow.window.webContents.on("did-finish-load", () => {
    curWindow.window.webContents.send(
      "fromMain",
      `Checking for updates. Current version ${app.getVersion()}`
    );
  });

}

app.whenReady().then(() => {

  const isAutoLaunch = process.argv.includes('--auto-launch');

  if (!isAutoLaunch) {

    tray = new Tray(path.join(__dirname, 'public/icons/png', '32x32.png')); // Replace with your icon file path

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open', click: () => {
          console.log(11, curWindow)
          if (!curWindow) {
            createWindow();
          } else {
            curWindow.window.show();
          }
        }
      },
      {
        label: 'Quit', click: () => {
          if (tray) {
            tray.destroy();  // Remove the tray icon
          }
          app.quit();
        }
      },
    ]);


    tray.setToolTip('saonas Printer');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (!curWindow) {
        createWindow();
      } else {
        curWindow.window.show();
      }
    });

    createWindow();

  } else {
    console.log("App launched in background (auto-launch mode).");
  }
});

socket = io("https://fundacionpiel.saonas.com")

socket.on("connect", () => {
  console.log("Connected to the server");

  axios({
    method: "post",
    url: "https://api.postmarkapp.com/email",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": process.env.POSTMARK_API,
    },
    data: {
      MessageStream: "outbound",
      From: `Enmanuel <contact@saonas.com>`,
      To: "enmanuelpsy@gmail.com",
      Subject: `Error al imprimir Electron`,
      TextBody: `Connection correct:`,
    },
  });

  // Send a message to the server
  socket.emit("messageFromClient", "Hello from Electron main process!");
});


function downloadPDF(url, outputPath) {
  return axios({
    url,
    method: 'GET',
    responseType: 'stream',
  }).then((response) => {
    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  });
}

socket.on("print-invoice", ({ api, options, user, url, token }) => {

  const msg = {
    action: "printed",
    status: 1,
    text: `Documento impreso en ${options.printer}`,
    user,
  };

  const pdfPath = path.join(app.getPath('temp'), 'downloaded-file.pdf');

  downloadPDF(url, pdfPath)
    .then(() => {
      return printer.print(pdfPath, {
        silent: true,
        ...options,
      });
    })
    .then(() => {
      console.log(msg)
      axios({
        method: "POST",
        url: `${api}/api/comunication/notification`,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          authorization: token,
        },
        data: msg,
      });
      printWindow.close();
    })
    .catch((err) => {
      axios({
        method: "post",
        url: "https://api.postmarkapp.com/email",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": process.env.POSTMARK_API,
        },
        data: {
          MessageStream: "outbound",
          From: `Enmanuel <contact@saonas.com>`,
          To: "enmanuelpsy@gmail.com",
          Subject: `Error al imprimir Electron`,
          TextBody: `Print failed:`,
        },
      });
      msg.status = 0;
      msg.text = `Documento no pudo ser impreso en ${options.printer}`;
      console.error('Failed to print PDF:', err);
      printWindow.close();
    });
});

// Handle connection errors
socket.on("connect_error", (error) => {
  console.log("Connection error:", error.message);

  axios({
    method: "post",
    url: "https://api.postmarkapp.com/email",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": process.env.POSTMARK_API,
    },
    data: {
      MessageStream: "outbound",
      From: `Enmanuel <contact@saonas.com>`,
      To: "enmanuelpsy@gmail.com",
      Subject: `Connection error Electron`,
      TextBody: `Connection error: ${error.message}`,
    },
  });

  curWindow.window.webContents.send(
    "connectionError",
    "Connection failed. Unable to reach the server."
  );
});

// Handle connection timeout
socket.on("connect_timeout", () => {
  console.log("Connection timed out");
  curWindow.window.webContents.send(
    "connectionError",
    "Connection timed out. Please try again."
  );


  axios({
    method: "post",
    url: "https://api.postmarkapp.com/email",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": process.env.POSTMARK_API,
    },
    data: {
      MessageStream: "outbound",
      From: `Enmanuel <contact@saonas.com>`,
      To: "enmanuelpsy@gmail.com",
      Subject: `Connection timeout Electron`,
      TextBody: `Connection timeout`,
    },
  });

});

// Handle failed reconnection attempts
socket.on("reconnect_failed", () => {
  console.log("Reconnection failed after multiple attempts");
  curWindow.window.webContents.send(
    "connectionError",
    "Reconnection failed. Please check your network."
  );

  axios({
    method: "post",
    url: "https://api.postmarkapp.com/email",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": process.env.POSTMARK_API,
    },
    data: {
      MessageStream: "outbound",
      From: `Enmanuel <contact@saonas.com>`,
      To: "enmanuelpsy@gmail.com",
      Subject: `Reconnect failed Electron`,
      TextBody: `Reconnect failed`,
    },
  });
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
});

/*New Update Available*/
autoUpdater.on("update-available", (info) => {
  curWindow.window.webContents.send(
    "fromMain",
    `Update available. Current version ${app.getVersion()}`
  );
  let pth = autoUpdater.downloadUpdate();
  curWindow.window.webContents.send("fromMain", pth);
});

autoUpdater.on("update-not-available", (info) => {
  curWindow.window.webContents.send(
    "fromMain",
    `No update available. Current version ${app.getVersion()}`
  );
});

/*Download Completion Message*/
autoUpdater.on("update-downloaded", (info) => {
  curWindow.window.webContents.send(
    "fromMain",
    `Update downloaded. Current version ${app.getVersion()}`
  );
});

autoUpdater.on("error", (info) => {
  curWindow.window.webContents.send("fromMain", info);
});

//Global exception handler
process.on("uncaughtException", function (err) {
  console.log(err);
});

app.on("window-all-closed", function () {
  if (process.platform != "darwin") app.quit();
});
