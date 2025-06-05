import { useState } from 'react'
import './App.css'

let trackId = 0

function App() {
  const [tracks, setTracks] = useState([])

  const addTrack = () => {
    setTracks([
      ...tracks,
      {
        id: trackId++,
        name: `Track ${trackId}`,
        color: '#00ffff',
        volume: 1,
        pan: 0,
        muted: false,
      },
    ])
  }

  const updateTrack = (id, updates) => {
    setTracks(tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }

  const removeTrack = (id) => {
    setTracks(tracks.filter((t) => t.id !== id))
  }

  return (
    <div className="p-4 space-y-4 bg-gray-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold">My Music Studio</h1>
      <button
        className="px-4 py-2 bg-cyan-600 rounded"
        onClick={addTrack}
      >
        Add Track
      </button>
      <div className="space-y-2">
        {tracks.map((track) => (
          <div
            key={track.id}
            className="p-2 rounded bg-gray-800 flex items-center space-x-2"
          >
            <input
              value={track.name}
              onChange={(e) => updateTrack(track.id, { name: e.target.value })}
              className="bg-transparent border-b border-gray-500 focus:outline-none"
            />
            <input
              type="color"
              value={track.color}
              onChange={(e) => updateTrack(track.id, { color: e.target.value })}
            />
            <label className="flex items-center space-x-1">
              <span className="text-sm">Vol</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={track.volume}
                onChange={(e) =>
                  updateTrack(track.id, { volume: Number(e.target.value) })
                }
              />
            </label>
            <label className="flex items-center space-x-1">
              <span className="text-sm">Pan</span>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={track.pan}
                onChange={(e) =>
                  updateTrack(track.id, { pan: Number(e.target.value) })
                }
              />
            </label>
            <label className="flex items-center space-x-1">
              <input
                type="checkbox"
                checked={track.muted}
                onChange={(e) =>
                  updateTrack(track.id, { muted: e.target.checked })
                }
              />
              <span className="text-sm">Mute</span>
            </label>
            <button
              className="ml-auto text-red-400"
              onClick={() => removeTrack(track.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="h-64 bg-gray-700 mt-4 flex items-center justify-center">
        <span className="text-gray-400">Timeline placeholder</span>
      </div>
    </div>
  )
}

export default App
