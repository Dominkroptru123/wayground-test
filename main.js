(function () {
    'use strict';

    // =========================
    // ==  GLOBAL STATE       ==
    // =========================

    const cachedAnswers = new Map();
    let lastProcessedQuestionId = '';
    let panelVisible = true;
    let hiddenByBlur = false;

    // =========================
    // ==  TEXT / KATEX FIX   ==
    // =========================

    function cleanText(textOrElement) {
        if (!textOrElement) return '';

        if (textOrElement instanceof Element) {
            const tex = textOrElement.querySelector(
                'annotation[encoding="application/x-tex"]'
            );
            if (tex) return tex.textContent.trim();

            return textOrElement.innerText
                .replace(/\s+/g, ' ')
                .trim();
        }

        return textOrElement
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // =========================
    // ==  PIN OBSERVER FIX   ==
    // =========================

    function observePin(onFound) {
        const pinRegex = /\b\d{3}\s?\d{3}\b|\b\d{4,8}\b/;

        const scan = root => {
            const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
                null
            );
            let node;
            while (node = walker.nextNode()) {
                const match = node.nodeValue.match(pinRegex);
                if (match) {
                    const pin = match[0].replace(/\D/g, '');
                    if (pin.length >= 4 && pin.length <= 8) {
                        onFound(pin);
                        return true;
                    }
                }
            }
            return false;
        };

        // scan lần đầu
        if (scan(document.body)) return;

        const observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.type === 'characterData') {
                    if (scan(m.target.parentNode)) {
                        observer.disconnect();
                        return;
                    }
                }

                for (const node of m.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (scan(node)) {
                            observer.disconnect();
                            return;
                        }
                    }
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    // =========================
    // ==   FETCH ANSWERS     ==
    // =========================

    async function fetchAndCacheAnswers(pin, statusDisplay) {
        statusDisplay.textContent = '🌀 Đang tải đáp án...';

        try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 8000);

            const res = await fetch(
                `https://api.quizit.online/quizizz/answers?pin=${pin}`,
                { signal: controller.signal }
            );

            if (!res.ok) throw new Error(`API ${res.status}`);

            const { data } = await res.json();
            if (!data?.answers) throw new Error('API không hợp lệ');

            cachedAnswers.clear();

            data.answers.forEach(item => {
                if (!item?._id) return;

                if (item.type === 'MSQ' && Array.isArray(item.answers)) {
                    const arr = item.answers.map(a => {
                        const temp = document.createElement('div');
                        temp.innerHTML = a.text;
                        return cleanText(temp);
                    }).filter(Boolean);

                    if (arr.length) cachedAnswers.set(item._id, arr);
                } else {
                    const temp = document.createElement('div');
                    temp.innerHTML = item.answers?.[0]?.text || '';
                    const ans = cleanText(temp);
                    if (ans) cachedAnswers.set(item._id, ans);
                }
            });

            return cachedAnswers.size > 0;
        } catch (e) {
            statusDisplay.textContent = `❌ Lỗi: ${e.message}`;
            statusDisplay.style.color = '#ff5555';
            return false;
        }
    }

    // =========================
    // ==  QUESTION OBSERVE  ==
    // =========================

    function getCurrentQuestionData() {
        const q = document.querySelector('[data-quesid]');
        if (!q) return null;
        return { questionId: q.dataset.quesid };
    }

    function showAnswer(statusDisplay, answerBox) {
        if (!cachedAnswers.size) return;

        const q = getCurrentQuestionData();
        if (!q || q.questionId === lastProcessedQuestionId) return;

        lastProcessedQuestionId = q.questionId;
        const answer = cachedAnswers.get(q.questionId);

        answerBox.innerHTML = '';

        if (answer) {
            statusDisplay.textContent = '📘 Đáp án';
            if (Array.isArray(answer)) {
                answer.forEach(a => {
                    const div = document.createElement('div');
                    div.textContent = '• ' + a;
                    answerBox.appendChild(div);
                });
            } else {
                answerBox.textContent = answer;
            }
        } else {
            statusDisplay.textContent = '❓ Không tìm thấy đáp án';
        }
    }

    function observeQuestions(statusDisplay, answerBox) {
        const observer = new MutationObserver(() => {
            setTimeout(() => showAnswer(statusDisplay, answerBox), 300);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // =========================
    // ==        UI          ==
    // =========================

    function initialize() {
        if (document.getElementById('solver-panel')) return;

        document.head.insertAdjacentHTML('beforeend', `
<style>
#solver-panel{
 position:fixed;
 bottom:20px;
 right:20px;
 z-index:999999;
 padding:12px 14px;
 background:rgba(26,27,30,.88);
 border-radius:14px;
 color:white;
 min-width:220px;
 font-family:system-ui;
}
#solver-status{
 text-align:center;
 font-weight:600;
 margin-bottom:8px;
}
#pin-container{
 display:flex;
 gap:6px;
}
#pin-input{
 flex:1;
 padding:6px;
 border-radius:8px;
 border:none;
 text-align:center;
}
#load-btn{
 padding:0 14px;
 border:none;
 border-radius:8px;
 cursor:pointer;
}
#solver-answer{
 margin-top:8px;
 font-size:14px;
 color:#50fa7b;
 white-space:pre-wrap;
}
</style>`);

        document.body.insertAdjacentHTML('beforeend', `
<div id="solver-panel">
    <div id="solver-status">🔎 Đang tìm Room Code...</div>
    <div id="pin-container">
        <input id="pin-input" placeholder="PIN">
        <button id="load-btn">Tải</button>
    </div>
    <div id="solver-answer"></div>
</div>`);

        const panel = document.getElementById('solver-panel');
        const pinInput = document.getElementById('pin-input');
        const loadBtn = document.getElementById('load-btn');
        const statusDisplay = document.getElementById('solver-status');
        const answerBox = document.getElementById('solver-answer');
        const pinContainer = document.getElementById('pin-container');

        const handleLoad = async () => {
            const pin = pinInput.value.replace(/\D/g, '');
            if (!pin) return;

            pinInput.disabled = loadBtn.disabled = true;

            if (await fetchAndCacheAnswers(pin, statusDisplay)) {
                pinContainer.style.display = 'none';
                statusDisplay.textContent = '🚀 Sẵn sàng';
                observeQuestions(statusDisplay, answerBox);
            } else {
                pinInput.disabled = loadBtn.disabled = false;
            }
        };

        loadBtn.onclick = handleLoad;
        pinInput.onkeydown = e => e.key === 'Enter' && handleLoad();

        // 🔍 AUTO PIN (FIX)
        observePin(pin => {
            pinInput.value = pin;
            statusDisplay.textContent = '✅ Đã tìm thấy Room Code';
            statusDisplay.style.color = '#50fa7b';
            setTimeout(handleLoad, 300);
        });

        // ⌨️ Toggle panel = X
        document.addEventListener('keydown', e => {
            if (e.key.toLowerCase() === 'x') {
                panelVisible = !panelVisible;
                panel.style.display = panelVisible ? 'block' : 'none';
            }
        });

        window.addEventListener('blur', () => {
            if (panelVisible) {
                panel.style.display = 'none';
                hiddenByBlur = true;
            }
        });

        window.addEventListener('focus', () => {
            if (panelVisible && hiddenByBlur) {
                panel.style.display = 'block';
                hiddenByBlur = false;
            }
        });
    }

    initialize();
})();
