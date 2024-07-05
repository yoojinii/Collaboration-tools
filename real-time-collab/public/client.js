// 서버와 연결
var socket = io();

// 메시지 보내기 예제
socket.emit('message', '안녕하세요, 서버!');

// 수신된 메시지 처리 예제
socket.on('message', function(message) {
    console.log('서버로부터 수신된 메시지:', message);
});

// 아이템 추가 요청 예제
socket.emit('addItem', { name: '새로운 아이템' });

// 업데이트된 아이템 처리 예제
socket.on('updateItems', function(items) {
    console.log('업데이트된 아이템:', items);
    // UI를 업데이트하세요
});