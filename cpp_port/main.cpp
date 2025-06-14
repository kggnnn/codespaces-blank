#include "httplib.h"
#include "json.hpp"
#include <aubio/aubio.h>
#include <sndfile.h>
#include <vector>
#include <string>
#include <cstdio>
#include <fstream>
#include <iostream>

using json = nlohmann::json;

struct Note {
    int pitch;
    float start;
    float duration;
    int velocity;
    std::string source;
};

// Rough note extraction using aubio pitch detection.
static std::vector<Note> extract_notes(const std::string &path) {
    uint_t hop_size = 512;
    uint_t buf_size = 2048;

    SNDFILE *sndfile;
    SF_INFO sfinfo;
    sfinfo.format = 0;
    sndfile = sf_open(path.c_str(), SFM_READ, &sfinfo);
    if (!sndfile) {
        std::cerr << "could not open file" << std::endl;
        return {};
    }

    uint_t samplerate = sfinfo.samplerate;

    fvec_t *in = new_fvec(hop_size);
    aubio_pitch_t *pitch = new_aubio_pitch("yin", buf_size, hop_size, samplerate);
    aubio_pitch_set_unit(pitch, "midi");
    aubio_pitch_set_silence(pitch, -40);

    uint_t total_frames = sfinfo.frames;
    std::vector<Note> notes;
    int last_pitch = -1;
    float start = 0.0f;
    float time = 0.0f;

    for (uint_t i = 0; i < total_frames; i += hop_size) {
        sf_read_float(sndfile, in->data, hop_size);
        fvec_t *out = new_fvec(1);
        aubio_pitch_do(pitch, in, out);
        float p = fvec_get_sample(out, 0);
        float conf = aubio_pitch_get_confidence(pitch);
        if (conf > 0.8 && p >= 36 && p <= 90) {
            int note = (int)(p + 0.5f);
            if (last_pitch == -1) {
                last_pitch = note;
                start = time;
            } else if (note != last_pitch) {
                notes.push_back({last_pitch, start, time - start, 80, "extracted"});
                last_pitch = note;
                start = time;
            }
        }
        time += (float)hop_size / samplerate;
        del_fvec(out);
    }
    if (last_pitch != -1) {
        notes.push_back({last_pitch, start, time - start, 80, "extracted"});
    }

    del_aubio_pitch(pitch);
    del_fvec(in);
    sf_close(sndfile);
    aubio_cleanup();
    return notes;
}

static std::vector<Note> generate_accompaniment(const std::vector<Note>& notes) {
    std::vector<Note> accomp;
    for (const auto& n : notes) {
        int root = n.pitch % 12;
        accomp.push_back({root, n.start, n.duration, 70, "accompaniment"});
        accomp.push_back({root + 4, n.start, n.duration, 70, "accompaniment"});
        accomp.push_back({root + 7, n.start, n.duration, 70, "accompaniment"});
    }
    return accomp;
}

int main(int argc, char* argv[]) {
    httplib::Server svr;

    svr.Get("/", [](const httplib::Request&, httplib::Response &res) {
        std::string html = "<!DOCTYPE html><html><body>";
        html += R"(<h1>Audio Notes (C++)</h1><form id='upload-form' enctype='multipart/form-data' method='post' action='/upload'>";
        html += R"(<input type='file' name='audio' accept='audio/*'><button type='submit'>Upload</button></form><pre id='results'></pre>";
        html += R"(<h2>Accompaniment</h2><button id='accomp-btn'>Generate</button><pre id='accomp'></pre>)";
        html += R"(<script>
            document.getElementById('upload-form').addEventListener('submit', async (e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const res = await fetch('/upload', { method: 'POST', body: formData });
              const json = await res.json();
              document.getElementById('results').textContent = JSON.stringify(json, null, 2);
              window.extractedNotes = json.notes || [];
            });
            document.getElementById('accomp-btn').addEventListener('click', async () => {
              if (!window.extractedNotes) return;
              const res = await fetch('/accompaniment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: window.extractedNotes })
              });
              const json = await res.json();
              document.getElementById('accomp').textContent = JSON.stringify(json, null, 2);
            });
        </script>");
        html += "</body></html>";
        res.set_content(html, "text/html");
    });

    svr.Post("/upload", [](const httplib::Request& req, httplib::Response& res) {
        auto file = req.get_file_value("audio");
        std::string path = std::tmpnam(nullptr);
        std::ofstream ofs(path, std::ios::binary);
        ofs << file.content;
        ofs.close();
        auto notes = extract_notes(path);
        std::remove(path.c_str());
        json j;
        j["notes"] = json::array();
        for (auto &n : notes) {
            j["notes"].push_back({{"pitch", n.pitch}, {"start", n.start}, {"duration", n.duration}, {"velocity", n.velocity}, {"source", n.source}});
        }
        res.set_content(j.dump(), "application/json");
    });

    svr.Post("/accompaniment", [](const httplib::Request& req, httplib::Response& res) {
        auto j = json::parse(req.body);
        std::vector<Note> notes;
        if (j.contains("notes")) {
            for (auto &n : j["notes"]) {
                notes.push_back({n["pitch"], n["start"], n["duration"], n.value("velocity", 80), "extracted"});
            }
        }
        auto accomp = generate_accompaniment(notes);
        json out;
        out["accompanimentNotes"] = json::array();
        for (auto &n : accomp) {
            out["accompanimentNotes"].push_back({{"pitch", n.pitch}, {"start", n.start}, {"duration", n.duration}, {"velocity", n.velocity}, {"source", n.source}});
        }
        res.set_content(out.dump(), "application/json");
    });

    std::cout << "Server starting on http://localhost:8080" << std::endl;
    svr.listen("0.0.0.0", 8080);
    return 0;
}
