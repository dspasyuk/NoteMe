// Copyright Denis Spasuk
let noteText;
let status;
let downloads;

// Global variables for continuous transcription
let mediaRecorder;
let fullAudioChunks = []; // Stores all audio data for the final save
let transcriptionSegments = []; // Stores complete audio segments for transcription
let audioContext; // Web Audio API context
let transcriber; // The loaded transformers.js pipeline
let recordingStartTime; // Track recording start time
let fullTranscription = ''; // Store the complete transcription text
let hasUnsavedChanges = false; // Track unsaved changes

// Function to initialize AudioContext and Transcriber
async function initializeAudioTools() {
    if (!audioContext) {
        audioContext = new AudioContext();
    }
    if (!transcriber) {
        // Dynamically import pipeline from transformers.js
        const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1');
        transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
            chunk_length_s: 15,
            stride_length_s: 5,
        });
    }
}

// Function to convert audio blob to audio buffer
async function convertBlobToAudioBuffer(blob) {
    try {
        const arrayBuffer = await blob.arrayBuffer();
        return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.error('Error decoding audio:', error);
        throw error;
    }
}

// Function to convert audio buffer to the format expected by transformers.js
async function audioBufferToFloat32Array(audioBuffer) {
    // If the sample rate is already 16kHz, return directly
    if (audioBuffer.sampleRate === 16000) {
        return audioBuffer.getChannelData(0);
    }

    // Create an OfflineAudioContext for resampling
    const offlineContext = new OfflineAudioContext(
        1, // mono
        audioBuffer.duration * 16000, // target length
        16000 // target sample rate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const resampledBuffer = await offlineContext.startRendering();
    return resampledBuffer.getChannelData(0);
}

// Function to process a complete audio segment
async function processAudioSegment(audioBuffer) {
    status.textContent = 'Transcribing audio segment...';

    await initializeAudioTools();

    try {
        if (audioBuffer.length === 0) {
            console.warn('Skipping empty audio buffer.');
            status.textContent = 'Empty audio segment, skipping transcription.';
            return;
        }
        const audioForModel = await audioBufferToFloat32Array(audioBuffer);

        const transcriptionResult = await transcriber(audioForModel);
        
        if (transcriptionResult.text && transcriptionResult.text.trim()) {
            // Add to our transcription storage and display in loaded-text
            fullTranscription += transcriptionResult.text + ' ';
            
            // Update the loaded-text display with transcription
            const loadedText = document.getElementById('loaded-text');
            let displayText = '';
            if (noteText.value) {
                displayText += `<h5>Note:</h5><p>${noteText.value}</p>`;
            }
            displayText += `<h5>Transcription:</h5><p>${fullTranscription}</p>`;
            loadedText.innerHTML = displayText;
            
            // Show the loaded note display if it's hidden
            const loadedNoteDisplay = document.getElementById('loaded-note-display');
            loadedNoteDisplay.style.display = 'block';
            
            status.textContent = 'Transcription updated.';
        }

    } catch (error) {
        console.error('Error during transcription:', error);
        status.textContent = `Error transcribing audio: ${error.message}`;
    }
}

// Function to create a new recording session for a segment
function createSegmentRecorder(stream, onComplete) {
    let segmentChunks = [];
    
    // Try different formats in order of preference
    let options;
    if (MediaRecorder.isTypeSupported('audio/wav')) {
        options = { mimeType: 'audio/wav' };
    } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
        options = { mimeType: 'audio/webm;codecs=pcm' };
    } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        options = { mimeType: 'audio/ogg;codecs=opus' };
    } else {
        options = {};
    }
    
    const segmentRecorder = new MediaRecorder(stream, options);
    
    segmentRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
            segmentChunks.push(event.data);
        }
    };
    
    segmentRecorder.onstop = async () => {
        if (segmentChunks.length > 0) {
            const segmentBlob = new Blob(segmentChunks, { type: segmentRecorder.mimeType || 'audio/wav' });
            if (segmentBlob.size > 0) {
                try {
                    const audioBuffer = await convertBlobToAudioBuffer(segmentBlob);
                    onComplete(audioBuffer);
                } catch (error) {
                    console.error('Error converting segment blob to audio buffer:', error);
                }
            }
        }
    };
    
    return segmentRecorder;
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOMContentLoaded event fired.');
    await initializeAudioTools();
    noteText = document.getElementById('note-text');
    noteText.addEventListener('input', () => {
        hasUnsavedChanges = true;
    });
    const pictureButton = document.getElementById('picture-button');
    const recordButton = document.getElementById('record-button');
    const saveButton = document.getElementById('save-button');
    status = document.getElementById('status');
    downloads = document.getElementById('downloads');

    const cameraContainer = document.getElementById('camera-container');
    const cameraFeed = document.getElementById('camera-feed');
    const snapButton = document.getElementById('snap-button');

    const imageContainer = document.getElementById('image-container');
    const canvas = document.getElementById('canvas');

    let imageBlobs = [];
    let audioBlob = null;
    let currentStream = null;
    let segmentRecorders = [];
    let segmentInterval = null;

    // --- Camera Functionality --- 
    pictureButton.addEventListener('click', async () => {
        try {
            let stream;
            try {
                // Try to get the back camera first
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            } catch (envError) {
                console.warn('Could not access environment camera, falling back to any available camera:', envError);
                // Fallback to any available camera (usually front if environment fails)
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }
            cameraFeed.srcObject = stream;
            console.log('Camera stream active:', stream.active, 'Video tracks:', stream.getVideoTracks().length);
            cameraFeed.play(); // Explicitly play the video
            cameraContainer.style.display = 'flex';
            imageContainer.innerHTML = ''; // Clear previous images
            imageBlobs = []; // Clear previous image blobs
        } catch (error) {
            console.error('Error accessing camera:', error);
            status.textContent = 'Could not access camera.';
        }
    });

    snapButton.addEventListener('click', () => {
        const context = canvas.getContext('2d');
        canvas.width = cameraFeed.videoWidth;
        canvas.height = cameraFeed.videoHeight;
        context.drawImage(cameraFeed, 0, 0, canvas.width, canvas.height);

        // Create a new image element for each captured image
        const newImage = document.createElement('img');
        newImage.src = canvas.toDataURL('image/png');
        newImage.style.width = 'calc(33.333% - 10px)';
        imageContainer.appendChild(newImage);
        imageContainer.style.display = 'block';
        hasUnsavedChanges = true;

        canvas.toBlob(blob => {
            imageBlobs.push(blob);
        }, 'image/png');
    });

    // --- Audio Recording Functionality ---
    recordButton.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            // Stop recording
            mediaRecorder.stop();
            if (segmentInterval) {
                clearInterval(segmentInterval);
                segmentInterval = null;
            }
        } else {
            // Start recording
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    if (!hasUnsavedChanges) {
                        fullAudioChunks = [];
                        transcriptionSegments = [];
                        fullTranscription = ''; // Reset transcription for new recording
                    }
                    currentStream = stream;
                    recordingStartTime = Date.now();
                    
                    // Try different formats in order of preference
                    let options;
                    if (MediaRecorder.isTypeSupported('audio/wav')) {
                        options = { mimeType: 'audio/wav' };
                    } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
                        options = { mimeType: 'audio/webm;codecs=pcm' };
                    } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                        options = { mimeType: 'audio/ogg;codecs=opus' };
                    } else {
                        options = {};
                    }
                    
                    // Main recorder for the full audio
                    mediaRecorder = new MediaRecorder(stream, options);
                    mediaRecorder.start();

                    recordButton.textContent = 'Stop Recording';
                    recordButton.classList.add('recording');
                    status.textContent = 'Recording...';
                    hasUnsavedChanges = true;

                    mediaRecorder.ondataavailable = event => {
                        if (event.data.size > 0) {
                            fullAudioChunks.push(event.data);
                        }
                    };

                    mediaRecorder.onstop = () => {
                        const mimeType = mediaRecorder.mimeType || 'audio/wav';
                        audioBlob = new Blob(fullAudioChunks, { type: mimeType });
                        
                        recordButton.textContent = 'Record Audio';
                        recordButton.classList.remove('recording');
                        status.textContent = 'Recording finished. Ready to save.';
                        
                        if (currentStream) {
                            currentStream.getTracks().forEach(track => track.stop());
                            currentStream = null;
                        }
                    };

                    // Create separate recorders for transcription segments
                    let currentSegmentRecorder = null;
                    
                    function startNewSegment() {
                        if (currentSegmentRecorder && currentSegmentRecorder.state === 'recording') {
                            currentSegmentRecorder.stop();
                        }
                        
                        currentSegmentRecorder = createSegmentRecorder(stream, (segmentBlob) => {
                            // Process this segment for transcription
                            processAudioSegment(segmentBlob);
                        });
                        
                        currentSegmentRecorder.start();
                    }
                    
                    // Start the first segment
                    startNewSegment();
                    
                    // Create new segments every 15 seconds
                    segmentInterval = setInterval(() => {
                        if (mediaRecorder && mediaRecorder.state === 'recording') {
                            startNewSegment();
                        }
                    }, 15000);
                })
                .catch(error => {
                    console.error('Error accessing microphone:', error);
                    status.textContent = 'Could not access microphone.';
                });
        }
    });

    // --- Save Functionality ---
    saveButton.addEventListener('click', async () => {
        if (!noteText.value && imageBlobs.length === 0 && !audioBlob) {
            status.textContent = 'Nothing to save!';
            return;
        }

        status.textContent = 'Preparing files...';

        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const transcription = fullTranscription; // Use our stored transcription instead of noteText

        const zip = new JSZip();

        let audioExtension = 'wav';
        if (audioBlob) {
            if (audioBlob.type.includes('webm')) {
                audioExtension = 'webm';
            } else if (audioBlob.type.includes('ogg')) {
                audioExtension = 'ogg';
            } else if (audioBlob.type.includes('mp4')) {
                audioExtension = 'mp4';
            }
        }

        const noteData = {
            text: noteText.value, // Manual notes from the user
            transcription: transcription, // Audio transcription
            imageFiles: imageBlobs.map((_, index) => `${timestamp}_image_${index}.png`), // Array of image filenames
            audioFile: audioBlob ? `${timestamp}_recording.${audioExtension}` : null,
        };

        // Add note.json to zip
        zip.file(`${timestamp}_note.json`, JSON.stringify(noteData, null, 2));

        // Add images to zip
        for (let i = 0; i < imageBlobs.length; i++) {
            zip.file(`${timestamp}_image_${i}.png`, imageBlobs[i]);
        }

        // Add audio to zip
        if (audioBlob) {
            zip.file(`${timestamp}_recording.${audioExtension}`, audioBlob);
        }

        // Generate and download the zip file
        zip.generateAsync({ type: "blob" })
            .then(function (content) {
                createDownloadLink(content, `${timestamp}_note.zip`);
                status.textContent = "Note saved as ZIP successfully!";
                hasUnsavedChanges = false;
            })
            .catch(error => {
                console.error('Error generating ZIP:', error);
                status.textContent = `Error saving note: ${error.message}`;
            });
    });

    function createDownloadLink(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    }

    // --- Load Note Functionality ---
    const noteFileInput = document.getElementById('note-file-input');
    const loadedNoteDisplay = document.getElementById('loaded-note-display');
    const loadedText = document.getElementById('loaded-text');
    const loadedImageContainer = document.getElementById('loaded-images-container');
    const loadedAudio = document.getElementById('loaded-audio');

    noteFileInput.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (files.length === 0) return;

        const zipFile = files[0];
        if (zipFile.type !== 'application/x-zip-compressed' && zipFile.type !== 'application/zip') {
            status.textContent = 'Please select a .zip file.';
            return;
        }

        status.textContent = 'Loading note from ZIP...';

        try {
            const zip = await JSZip.loadAsync(zipFile);
            let noteData = null;

            // Find the note.json file
            const jsonFileName = Object.keys(zip.files).find(fileName => fileName.endsWith('_note.json'));
            if (jsonFileName) {
                const jsonContent = await zip.file(jsonFileName).async('text');
                noteData = JSON.parse(jsonContent);
            } else {
                status.textContent = 'note.json not found in the ZIP file.';
                return;
            }

            let displayText = `<h5>Note:</h5><p>${noteData.text}</p>`;
            if (noteData.transcription) {
                displayText += `<h5>Transcription:</h5><p>${noteData.transcription}</p>`;
            }
            loadedText.innerHTML = displayText;

            loadedImageContainer.innerHTML = ''; // Clear previous images
            if (noteData.imageFiles && noteData.imageFiles.length > 0) {
                for (const imageFileName of noteData.imageFiles) {
                    const imageFile = zip.file(imageFileName);
                    if (imageFile) {
                        const imgBlob = await imageFile.async('blob');
                        const img = document.createElement('img');
                        img.src = URL.createObjectURL(imgBlob);
                        img.classList.add('w-25', 'rounded', 'border', 'me-2', 'mb-2');
                        loadedImageContainer.appendChild(img);
                    }
                }
            }

            if (noteData.audioFile) {
                const audioFile = zip.file(noteData.audioFile);
                if (audioFile) {
                    const audioBlob = await audioFile.async('blob');
                    loadedAudio.src = URL.createObjectURL(audioBlob);
                    loadedAudio.style.display = 'block';
                } else {
                    loadedAudio.style.display = 'none';
                }
            } else {
                loadedAudio.style.display = 'none';
            }

            loadedNoteDisplay.style.display = 'block';
            status.textContent = 'Note loaded successfully.';

        } catch (error) {
            console.error('Error loading note from ZIP:', error);
            status.textContent = `Could not read the note file from ZIP: ${error.message}`;
        }
    });

    // --- OGG File Transcription Functionality ---
    const oggFileInput = document.getElementById('ogg-file-input');

    oggFileInput.addEventListener('change', async (event) => {
        console.log('OGG file input change event fired.');
        const files = event.target.files;
        if (files.length === 0) {
            console.log('No OGG file selected.');
            return;
        }

        const oggFile = files[0];
        console.log('Selected OGG file:', oggFile.name, oggFile.type);
        if (!oggFile.type.includes('ogg')) {
            status.textContent = 'Please select an OGG audio file.';
            console.log('Invalid file type selected:', oggFile.type);
            return;
        }

        status.textContent = 'Loading OGG file for transcription...';
        fullTranscription = ''; // Clear previous transcription
        console.log('Starting OGG transcription process...');

        try {
            await initializeAudioTools();
            const audioBuffer = await convertBlobToAudioBuffer(oggFile);
            
            // Define chunk size (e.g., 30 seconds)
            const chunkSize = 30; // seconds
            const sampleRate = audioBuffer.sampleRate;
            const samplesPerChunk = sampleRate * chunkSize;

            fullTranscription = ''; // Clear previous transcription

            for (let i = 0; i < audioBuffer.length; i += samplesPerChunk) {
                const start = i;
                const end = Math.min(i + samplesPerChunk, audioBuffer.length);
                const chunkLength = end - start;

                // Create a new AudioBuffer for the chunk
                const chunkBuffer = audioContext.createBuffer(
                    audioBuffer.numberOfChannels,
                    chunkLength,
                    sampleRate
                );

                // Copy audio data to the chunk buffer
                for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                    const originalChannelData = audioBuffer.getChannelData(channel);
                    const chunkChannelData = chunkBuffer.getChannelData(channel);
                    for (let j = 0; j < chunkLength; j++) {
                        chunkChannelData[j] = originalChannelData[start + j];
                    }
                }
                
                status.textContent = `Transcribing chunk ${Math.floor(i / samplesPerChunk) + 1}...`;
                await processAudioSegment(chunkBuffer);
            }

            status.textContent = 'OGG file transcribed successfully.';
            console.log('OGG file transcription successful.');
        } catch (error) {
            console.error('Error transcribing OGG file:', error);
            status.textContent = `Error transcribing OGG file: ${error.message}`;
        }
    });

    window.addEventListener('beforeunload', (event) => {
        if (hasUnsavedChanges) {
            // Cancel the event as stated by the standard.
            event.preventDefault();
            // Chrome requires returnValue to be set.
            event.returnValue = '';
            // Most browsers will display a default message, but some might show this one.
            return 'You have unsaved changes. Are you sure you want to leave?';
        }
    });
});
