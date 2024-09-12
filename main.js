const { app, BrowserWindow, ipcMain, ipcRenderer } = require("electron");
const MainScreen = require("./screens/main/mainScreen");
const Globals = require("./globals");
const { autoUpdater, AppUpdater } = require("electron-updater");
const io = require("socket.io-client");
const { print } = require("pdf-to-printer");
const axios = require("axios");

let curWindow;
let socket;

//Basic flags
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
  curWindow = new MainScreen();
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length == 0) createWindow();
  });

  autoUpdater.checkForUpdates();
  curWindow.window.webContents.on("did-finish-load", () => {
    curWindow.window.webContents.send(
      "fromMain",
      `Checking for updates. Current version ${app.getVersion()}`
    );
  });
});

ipcMain.on("toMain", (event, data) => {
  console.log(`Received message from renderer: ${data}`);
  if (socket) {
    socket.disconnect(true);
  }

  socket =
    process.env.NODE_ENV === "production"
      ? io(data ? data : "https://clinicapieldravasquez.saonas.com/")
      : io(data ? data : "http://localhost:5032");

  socket.on("connect", () => {
    console.log("Connected to the server");

    // Send a message to the server
    socket.emit("messageFromClient", "Hello from Electron main process!");
  });

  socket.on("print-invoice", ({ data, options, user, url, token }) => {
    print(url).then((res) => {
      console.log(res);
    }).catch(err => {
      console.log('err', err);
    });
    console.log(1);
    return;
    const dataURL = `data:application/pdf;base64,${data}`;

    let printWindow = new BrowserWindow({
      show: true,
      width: 800,
      height: 600,
      webPreferences: {
        plugins: true,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Load PDF content into the print window
    console.log(url);
    printWindow.maximize();
    printWindow.loadURL(url);
    printWindow.webContents.on("did-finish-load", () => {
      printWindow.webContents.print(
        {
          ...options,
        },
        async (success, errorType) => {
          console.log(1, success);
          console.log(2, errorType);
          const msg = {
            action: "printed",
            status: 1,
            text: `Documento impreso en ${options.deviceName}`,
            user,
          };

          if (!success) {
            await axios({
              method: "post",
              url: "https://api.postmarkapp.com/email",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "X-Postmark-Server-Token": process.env.POSTMARK_API,
              },
              data: {
                MessageStream: "outbound",
                From: `Clinica Piel Dra. Vásquez <contact@saonas.com>`,
                To: "enmanuelpsy@gmail.com",
                Subject: `Error al imprimir Electron`,
                TextBody: `Print failed: ${errorType}`,
              },
            });
            msg.status = 0;
            msg.text = `Documento no pudo ser impreso en ${options.deviceName}`;
            console.log("Print failed: ", errorType);
          }
          console.log(msg);
          axios({
            method: "POST",
            url: `${process.env.API}/comunication/notification`,
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              authorization: token,
            },
            data: msg,
          });
          printWindow.close();
        }
      );
    });
    printWindow.webContents.on(
      "did-fail-load",
      (event, errorCode, errorDescription) => {
        console.error("Failed to load content: ", errorDescription);
      }
    );
  });

  // Handle connection errors
  socket.on("connect_error", (error) => {
    console.log("Connection error:", error.message);
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
  });

  // Handle failed reconnection attempts
  socket.on("reconnect_failed", () => {
    console.log("Reconnection failed after multiple attempts");
    curWindow.window.webContents.send(
      "connectionError",
      "Reconnection failed. Please check your network."
    );
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from server");
  });
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
