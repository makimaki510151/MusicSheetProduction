const audio = new Audio();
let isPlaying = false;
let notes = [];
let currentNoteType = 'tap';
let currentSnap = 8;
let bpm = 120;
let offset = 0;
let holdStartNote = null;
let zoomLevel = 100;
let isDraggingSeek = false;
let animationFrameId = null;
let autoScroll = true;
let lastUserScrollTime = 0;

const playBtn = document.getElementById('playBtn');
const timeDisplay = document.getElementById('timeDisplay');
const seekBar = document.getElementById('seekBar');
const seekProgress = document.getElementById('seekProgress');
const seekHandle = document.getElementById('seekHandle');
const editor = document.getElementById('editor');
const editorContent = document.getElementById('editorContent');
const lanes = document.getElementById('lanes');
const judgmentLine = document.getElementById('judgmentLine');
const autoScrollBtn = document.getElementById('autoScrollBtn');

// 初期化
function init() {
    setupEventListeners();
    drawGridLines();
    updateTimeDisplay();
}

function setupEventListeners() {
    // 音声ファイル読み込み
    document.getElementById('audioFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            audio.src = URL.createObjectURL(file);
            document.getElementById('fileName').textContent = file.name;
        }
    });

    // 再生/停止
    playBtn.addEventListener('click', togglePlay);

    // シークバー クリック
    seekBar.addEventListener('click', (e) => {
        if (e.target === seekHandle) return;
        const rect = seekBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        audio.currentTime = percent * audio.duration;
    });

    // シークハンドル ドラッグ
    seekHandle.addEventListener('mousedown', (e) => {
        isDraggingSeek = true;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingSeek) return;
        const rect = seekBar.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        audio.currentTime = percent * audio.duration;
    });

    document.addEventListener('mouseup', () => {
        isDraggingSeek = false;
    });

    // 時間更新（スムーズな更新用）
    function updateLoop() {
        if (!isDraggingSeek) {
            updateTimeDisplay();
            updateJudgmentLine();
            if (autoScroll && isPlaying && Date.now() - lastUserScrollTime > 2000) {
                updateEditorScroll();
            }
        }
        animationFrameId = requestAnimationFrame(updateLoop);
    }
    updateLoop();

    // BPM・オフセット変更
    document.getElementById('bpm').addEventListener('input', (e) => {
        bpm = parseInt(e.target.value);
        drawGridLines();
        renderNotes();
    });

    document.getElementById('offset').addEventListener('input', (e) => {
        offset = parseInt(e.target.value);
    });

    // ノーツタイプ選択
    document.querySelectorAll('.note-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.note-type-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentNoteType = e.target.dataset.type;
            holdStartNote = null;
        });
    });

    // スナップ選択
    document.querySelectorAll('.snap-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.snap-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentSnap = parseInt(e.target.dataset.snap);
            drawGridLines();
        });
    });

    // ズーム変更
    document.getElementById('zoom').addEventListener('input', (e) => {
        zoomLevel = parseInt(e.target.value);
        document.getElementById('zoomValue').textContent = zoomLevel + '%';
        updateZoom();
        renderNotes();
    });

    // 自動スクロール切り替え
    autoScrollBtn.addEventListener('click', () => {
        autoScroll = !autoScroll;
        autoScrollBtn.classList.toggle('active');
        autoScrollBtn.textContent = autoScroll ? '自動追従 ON' : '自動追従 OFF';
    });

    // エディタのスクロール監視
    let scrollTimeout;
    editor.addEventListener('scroll', () => {
        if (autoScroll && isPlaying) {
            lastUserScrollTime = Date.now();
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                if (Date.now() - lastUserScrollTime > 2000) {
                    lastUserScrollTime = 0;
                }
            }, 2000);
        }
    });

    // ホイールスクロール時は自動追従を一時停止
    editor.addEventListener('wheel', () => {
        if (autoScroll && isPlaying) {
            lastUserScrollTime = Date.now();
        }
    }, { passive: true });

    // レーンクリック
    document.querySelectorAll('.lane').forEach(lane => {
        lane.addEventListener('click', handleLaneClick);
        lane.addEventListener('contextmenu', handleLaneRightClick);
    });

    // 保存・読込
    document.getElementById('saveBtn').addEventListener('click', saveJSON);
    document.getElementById('loadFile').addEventListener('change', loadJSON);
}

function drawGridLines() {
    const baseMeasureHeight = 200;
    const measureHeight = baseMeasureHeight * (zoomLevel / 100);
    let divisions = currentSnap;
    
    if (currentSnap === 0) {
        divisions = 16;
    }
    
    const lineHeight = measureHeight / divisions;

    document.querySelectorAll('.grid-line').forEach(el => el.remove());

    const numMeasures = Math.ceil(editorContent.offsetHeight / measureHeight);

    for (let measure = 0; measure < numMeasures; measure++) {
        for (let division = 0; division < divisions; division++) {
            const y = measure * measureHeight + division * lineHeight;
            const line = document.createElement('div');
            line.className = 'grid-line' + (division === 0 ? ' measure' : '');
            line.style.top = y + 'px';
            editorContent.appendChild(line);
        }
    }
}

function updateZoom() {
    const baseMeasureHeight = 200;
    const newHeight = (baseMeasureHeight * (zoomLevel / 100)) * 20;
    editorContent.style.height = newHeight + 'px';
    drawGridLines();
}

function togglePlay() {
    if (isPlaying) {
        audio.pause();
        playBtn.textContent = '▶';
    } else {
        audio.play();
        playBtn.textContent = '⏸';
    }
    isPlaying = !isPlaying;
}

function updateTimeDisplay() {
    const current = formatTime(audio.currentTime || 0);
    const duration = formatTime(audio.duration || 0);
    timeDisplay.textContent = `${current} / ${duration}`;

    const percent = (audio.currentTime / audio.duration) * 100 || 0;
    seekProgress.style.width = percent + '%';
    seekHandle.style.left = percent + '%';
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateEditorScroll() {
    const currentTime = (audio.currentTime || 0) * 1000 + offset;
    const scrollY = timeToY(currentTime) - 100;
    editor.scrollTop = Math.max(0, scrollY);
}

function updateJudgmentLine() {
    const currentTime = (audio.currentTime || 0) * 1000 + offset;
    const y = timeToY(currentTime);
    judgmentLine.style.top = y + 'px';
}

function timeToY(time) {
    const beatDuration = (60 / bpm) * 1000;
    const measureDuration = beatDuration * 4;
    const baseMeasureHeight = 200;
    const measureHeight = baseMeasureHeight * (zoomLevel / 100);
    return (time / measureDuration) * measureHeight;
}

function yToTime(y) {
    const beatDuration = (60 / bpm) * 1000;
    const measureDuration = beatDuration * 4;
    const baseMeasureHeight = 200;
    const measureHeight = baseMeasureHeight * (zoomLevel / 100);
    const time = (y / measureHeight) * measureDuration;
    
    if (currentSnap === 0) {
        return time;
    }
    
    const snapDuration = beatDuration / (currentSnap / 4);
    return Math.round(time / snapDuration) * snapDuration;
}

function handleLaneClick(e) {
    if (e.target.classList.contains('note')) return;

    const lane = parseInt(e.currentTarget.dataset.lane);
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + editor.scrollTop;
    const time = yToTime(y);

    if (currentNoteType === 'tap') {
        addNote({ time, lane, type: 'tap' });
    } else if (currentNoteType === 'hold') {
        if (!holdStartNote) {
            holdStartNote = { time, lane };
            
            const preview = document.createElement('div');
            preview.className = 'hold-creating';
            preview.style.top = timeToY(time) + 'px';
            preview.style.height = '20px';
            preview.id = 'holdPreview';
            e.currentTarget.appendChild(preview);
        } else {
            const duration = time - holdStartNote.time;
            if (duration > 0 && holdStartNote.lane === lane) {
                addNote({ 
                    time: holdStartNote.time, 
                    lane: holdStartNote.lane, 
                    type: 'hold', 
                    duration 
                });
            }
            document.getElementById('holdPreview')?.remove();
            holdStartNote = null;
        }
    }
}

function handleLaneRightClick(e) {
    e.preventDefault();
    const noteEl = e.target.closest('.note');
    if (noteEl) {
        const index = parseInt(noteEl.dataset.index);
        removeNote(index);
    }
}

function addNote(note) {
    notes.push(note);
    renderNotes();
}

function removeNote(index) {
    notes.splice(index, 1);
    renderNotes();
}

function renderNotes() {
    document.querySelectorAll('.note').forEach(el => el.remove());

    notes.forEach((note, index) => {
        const lane = document.querySelector(`.lane[data-lane="${note.lane}"]`);
        const noteEl = document.createElement('div');
        noteEl.className = `note ${note.type}`;
        noteEl.dataset.index = index;

        const y = timeToY(note.time);
        noteEl.style.top = y + 'px';

        if (note.type === 'hold') {
            const baseMeasureHeight = 200;
            const height = (note.duration / ((60 / bpm) * 1000)) * (baseMeasureHeight * (zoomLevel / 100) / 4);
            noteEl.style.height = height + 'px';
        }

        lane.appendChild(noteEl);
    });
}

function saveJSON() {
    const data = {
        metadata: {
            title: document.getElementById('title').value || '無題',
            bpm: bpm,
            offset: offset
        },
        notes: notes.sort((a, b) => a.time - b.time).map(note => ({
            time: note.time,
            lane: note.lane,
            type: note.type,
            ...(note.duration && { duration: note.duration })
        }))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.metadata.title}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function loadJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            
            document.getElementById('title').value = data.metadata.title || '';
            document.getElementById('bpm').value = data.metadata.bpm || 120;
            document.getElementById('offset').value = data.metadata.offset || 0;
            
            bpm = data.metadata.bpm || 120;
            offset = data.metadata.offset || 0;
            notes = data.notes || [];
            
            drawGridLines();
            renderNotes();
            
            alert('譜面データを読み込みました！');
        } catch (error) {
            alert('JSONファイルの読み込みに失敗しました。');
        }
    };
    reader.readAsText(file);
}

init();