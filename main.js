(function () {
    'use strict';

    const cachedAnswers = new Map();
    let lastProcessedQuestionId = '';
    let panelVisible = true;
    let hiddenByBlur = false;

    const cleanText = (text) =>
        text?.replace(/<p>|<\/p>/g, '').trim().replace(/\s+/g, ' ') || '';


    function findGamePinOnce() {
        const pinRegex = /\b\d{4}(?:[\s\-–—]?\d{2,4})?\b/;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;

        while (node = walker.nextNode()) {
            const match = node.nodeValue.match(pinRegex);
            if (match && node.parentElement?.offsetParent !== null) {
                const pin = match[0].replace(/\D/g, '');
                if (pin.length >= 4 && pin.length <= 8) return pin;
            }
        }
        return null;
    }

    function observePin(onFound) {
        const pinRegex = /\b\d{4}(?:[\s\-–—]?\d{2,4})?\b/;

        const initialPin = findGamePinOnce();
        if (initialPin) {
            onFound(initialPin);
            return;
        }

        const observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== Node.TEXT_NODE) continue;
                    const match = node.nodeValue.match(pinRegex);
                    if (!match) continue;

                    const pin = match[0].replace(/\D/g, '');
                    if (pin.length >= 4 && pin.length <= 8) {
                        observer.disconnect();
                        onFound(pin);
                        return;
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

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

            data.answers.forEach(item => {
                if (!item?._id) return;

                if (item.type === 'MSQ' && Array.isArray(item.answers)) {
                    const arr = item.answers
                        .map(a => cleanText(a.text))
                        .filter(Boolean);
                    if (arr.length) cachedAnswers.set(item._id, arr);
                } else {
                    const ans = cleanText(item.answers?.[0]?.text);
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

    function initialize() {
        if (document.getElementById('solver-panel')) return;

        document.head.insertAdjacentHTML('beforeend', `
<style>
#solver-panel{
 position:fixed;bottom:20px;right:20px;z-index:999999;
 padding:12px 14px;background:rgba(26,27,30,.88);
 border-radius:14px;color:white;min-width:220px;
 font-family:system-ui
}
#solver-status{text-align:center;font-weight:600;margin-bottom:8px}
#pin-container{display:flex;gap:6px}
#pin-input{flex:1;padding:6px;border-radius:8px;border:none;text-align:center}
#load-btn{padding:0 14px;border:none;border-radius:8px;cursor:pointer}
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
        observePin(pin => {
            pinInput.value = pin;
            statusDisplay.textContent = '✅ Đã tìm thấy Room Code';
            statusDisplay.style.color = '#50fa7b';
            setTimeout(handleLoad, 300);
        });
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
