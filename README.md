# Firebase Studio

This project originally used Next.js with Genkit AI flows. A new C++ implementation is provided in the `cpp_port` directory using a small web server based on `httplib` and `aubio` for basic note extraction.

To build and run the C++ version:

```bash
cd cpp_port
make
./server
```

The server exposes `/upload` for audio files and `/accompaniment` for triad accompaniment generation. It serves a simple HTML interface at the root path.

For the original frontend, see `src/app/page.tsx`.
