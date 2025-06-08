
import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: 'AudioNotes - Audio to MIDI Converter',
  description: 'Convert audio files to MIDI with a visual piano roll editor.',
};

export default function RootLayout({
  children,
  params, // Explicitly acknowledge the params prop
}: Readonly<{
  children: React.ReactNode;
  params: { [key: string]: string | string[] | undefined }; // Add params to the type
}>) {
  // While `params` is now in scope, avoid enumerating it here (e.g., Object.keys(params))
  // unless you are sure it's a plain object and it's necessary.
  // For the root layout, `params` will be an empty object: {}
  return (
    <html lang="en" className="dark"> 
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
