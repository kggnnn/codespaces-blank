const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  const startUrl =
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:5173'
      : path.join(__dirname, 'client/dist/index.html')

  if (process.env.NODE_ENV === 'development') {
    win.loadURL(startUrl)
  } else {
    win.loadFile(startUrl)
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
