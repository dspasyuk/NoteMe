# NoteMe

NoteMe is a simple, client-side web application designed to help you quickly capture thoughts, record audio, take multiple pictures, and even transcribe audio to text. All your notes, including media, are conveniently saved and loaded as a single ZIP file.

## Features

-   **Text Notes:** Jot down your thoughts in a dedicated text area.
-   **Audio Recording:** Record audio directly from your microphone.
-   **Audio Transcription:** Transcribe recorded audio or uploaded OGG files to text using `transformers.js` (Whisper model).
-   **Multiple Picture Capture:** Take and save multiple pictures using your device's camera.
-   **Integrated Data Management:** All note components (text, transcription, images, audio) are saved together in a single `.zip` file for easy organization and portability.
-   **Load Notes:** Load previously saved `.zip` note files to review your content.
-   **Unsaved Changes Warning:** Get a warning before leaving the page if you have unsaved changes.
-   **Responsive UI:** A clean, dark-themed user interface built with Bootstrap.

## How to Use

NoteMe is a client-side application, meaning it runs directly in your web browser without needing a server.

1.  **Clone the Repository:**
    ```bash
    git clone <repository_url>
    cd noteme
    ```
2.  **Open in Browser:** Simply open the `index.html` file in your preferred web browser.
    ```bash
    # On Linux/macOS
    xdg-open index.html
    # On Windows
    start index.html
    ```

### Capturing a Note

-   **Type your note:** Use the text area to write your main note.
-   **Record Audio:** Click "Record Audio" to start recording. Click again to stop. The transcription will appear automatically.
-   **Take Pictures:** Click "Take Picture" to activate your camera. Click "Snap" multiple times to capture several images. The camera feed will remain active until you close the browser tab or navigate away.
-   **Save Note:** Click "Save Note" to download a `.zip` file containing your text, transcription, and all captured media.

### Loading a Note

-   **Select ZIP File:** Under the "Load a Note" section, click "Choose File" next to "Select a `note.json` file:" and select the `.zip` file you previously saved.
-   The application will automatically extract and display the note's content, including text, transcription, images, and audio.

### Transcribing an OGG Audio File

-   **Select OGG File:** Under the "Load a Note" section, click "Choose File" next to "Transcribe an OGG audio file:" and select an OGG audio file.
-   The application will transcribe the audio and display the text.

## Technologies Used

-   **HTML5**
-   **CSS3** (with [Bootstrap 5.3](https://getbootstrap.com/))
-   **JavaScript**
-   **[transformers.js](https://huggingface.co/docs/transformers.js/index)**: For client-side audio transcription using the Whisper model.
-   **[JSZip](https://stuk.github.io/jszip/)**: For creating and extracting ZIP archives in the browser.

## Known Limitations

-   **Background Audio Recording:** Due to browser security and power-saving policies, continuous audio recording when the phone screen is off is generally not supported for web applications. Recording will likely pause or stop when the browser tab is in the background or the screen is off.

-   <img width="1053" height="1120" alt="Screenshot from 2025-08-03 18-56-08" src="https://github.com/user-attachments/assets/f0339ef9-60c9-4889-93e8-285a818130d6" />

