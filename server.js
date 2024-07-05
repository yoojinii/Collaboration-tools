const express = require('express');
const http = require('http');
const path = require('path');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const SocketIO = require('socket.io'); // socket.io 모듈을 SocketIO 변수로 가져옴
const crypto = require('crypto');

const app = express();
const server = http.createServer(app); // HTTP 서버 생성

// MySQL 데이터베이스 연결 설정
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root', // 사용자명
    password: '비밀', // 암호
    database: 'my_table', // 데이터베이스 이름
    timezone: 'Asia/Seoul' // MySQL 시간대 설정
});

// 데이터베이스 연결
db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Connected to the MySQL database.');
});

// 세션 설정
const sessionMiddleware = session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // HTTPS 사용 시 true로 설정
});


// Use session middleware for Express app
app.use(sessionMiddleware);

// Socket.IO 설정
const io = SocketIO(server); // SocketIO를 사용하여 서버와 소켓 연결

// Socket.IO와 세션 공유 설정
const sharedSession = require('express-socket.io-session');
io.use(sharedSession(sessionMiddleware, {
    autoSave: true
}));

// 기타 미들웨어 설정
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 회원가입 라우트
app.post('/signup', (req, res) => {
    const { id, username, password } = req.body;
    const query = 'INSERT INTO userTable (id, username, password) VALUES (?, ?, ?)';
    
    db.query(query, [id, username, password], (err, result) => {
        if (err) {
            console.error('Error inserting data:', err);
            res.status(500).send('Server error');
            return;
        }
        res.status(200).send('User registered successfully');
    });
});

// 로그인 라우트 추가
app.post('/login', (req, res) => {
    const { id, password } = req.body;
    const query = 'SELECT * FROM userTable WHERE id = ? AND password = ?';
    
    db.query(query, [id, password], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Server error');
            return;
        }
        if (result.length > 0) {
            // 세션 설정
            req.session.user = {
                id: result[0].id,
                username: result[0].username
            };
            res.status(200).send('Login successful');
        } else {
            res.status(401).send('Invalid username or password');
        }
    });
});



// 로그아웃 라우트
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            res.status(500).send('Error logging out');
        } else {
            res.redirect('/login'); // 로그인 페이지로 리다이렉트
        }
    });
});

// 인증 미들웨어
const requireLogin = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).send('Login required');
    }
};

// ToDo 생성 라우트
app.post('/api/todos', requireLogin, (req, res) => {
    const { content } = req.body;
    const query = 'INSERT INTO todo (content) VALUES (?)';
    
    db.query(query, [content], (err, result) => {
        if (err) {
            console.error('Error creating todo:', err);
            res.status(500).send('Error creating todo');
            return;
        }
        res.status(201).send('Todo created');
    });
});

// ToDo 목록 조회 라우트
app.get('/api/todos', requireLogin, (req, res) => {
    const query = 'SELECT * FROM todo';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching todos:', err);
            res.status(500).send('Error fetching todos');
            return;
        }
        res.json(results);
    });
});

// ToDo 완료 상태 업데이트 라우트
app.put('/api/todos/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    const { completed } = req.body;
    const query = 'UPDATE todo SET completed = ? WHERE id = ?';
    
    db.query(query, [completed, id], (err, result) => {
        if (err) {
            console.error('Error updating todo:', err);
            res.status(500).send('Error updating todo');
            return;
        }
        res.status(200).send('Todo updated');
    });
});

// ToDo 삭제 라우트
app.delete('/api/todos/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM todo WHERE id = ?';
    
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error deleting todo:', err);
            res.status(500).send('Error deleting todo');
            return;
        }
        res.status(200).send('Todo deleted');
    });
});

// 캘린더 이벤트 생성 API
app.post('/api/calendar', requireLogin, (req, res) => {
    const { content, start_date, end_date } = req.body;
    const query = 'INSERT INTO calendar (content, start_date, end_date) VALUES (?, ?, ?)';

    db.query(query, [content, new Date(start_date), new Date(end_date)], (err, result) => {
        if (err) {
            console.error('Error inserting calendar event:', err);
            res.status(500).send('Error inserting calendar event');
            return;
        }
        res.status(201).send('Calendar event created');
    });
});

// 캘린더 이벤트 조회 API
app.get('/api/calendar', requireLogin, (req, res) => {
    const query = 'SELECT * FROM calendar';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching calendar events:', err);
            res.status(500).send('Error fetching calendar events');
            return;
        }
        // FullCalendar에 맞게 이벤트 객체로 변환하여 전송
        const events = results.map(event => ({
            id: event.id,
            title: event.content,
            start: event.start_date,
            end: event.end_date
        }));
        res.json(events);
    });
});

// Fetch workspaces 불러오기
app.get('/api/workspaces', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const query = 'SELECT * FROM workspaces WHERE user_id = ?';
    
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching workspaces:', err);
            res.status(500).send('Error fetching workspaces');
            return;
        }
        res.json(results);
    });
});

//workspace 라우트
app.post('/api/workspaces', requireLogin, (req, res) => {
    const { workspace_name } = req.body;
    const userId = req.session.user.id;
    const query = 'INSERT INTO workspaces (user_id, workspace_name) VALUES (?, ?)';
    
    db.query(query, [userId, workspace_name], (err, result) => {
        if (err) {
            console.error('Error creating workspace:', err);
            res.status(500).send('Error creating workspace');
            return;
        }
        res.status(201).send('Workspace created');
    });
});

// 메모 저장 라우트
app.post('/api/memos', requireLogin, (req, res) => {
    const { title, content } = req.body; // 제목과 내용 받아오기
    const userId = req.session.user.id;
    const query = 'INSERT INTO personal_memo (user_id, memo_title, content) VALUES (?, ?, ?)'; // 제목과 내용 추가
    
    db.query(query, [userId, title, content], (err, result) => {
        if (err) {
            console.error('Error inserting memo:', err);
            res.status(500).send('Error inserting memo');
            return;
        }
        res.status(201).send('Memo created');
    });
});

// 메모 불러오기 라우트
app.get('/api/memos', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const query = 'SELECT * FROM personal_memo WHERE user_id = ?';
    
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching memos:', err);
            res.status(500).send('Error fetching memos');
            return;
        }
        res.json(results);
    });
});

// 사용자 정보 라우트
app.get('/api/user', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ username: req.session.user.username });
    } else {
        res.status(401).send('Login required');
    }
});

// 각 HTML 파일에 대한 라우트 설정
app.get('/workspace.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'real-time-collab', 'public', 'workspace.html'));
});

app.get('/calendar.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'real-time-collab', 'public', 'calendar.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'real-time-collab', 'public', 'join.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'real-time-collab', 'public', 'login.html'));
});

app.get('/todo.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'real-time-collab', 'public', 'todo.html'));
});

// 루트 경로('/')에 대한 라우트 설정 (index.html을 제공)
app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'real-time-collab', 'public', 'index.html'));
});

app.get('/chat.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'real-time-collab', 'public', 'chat.html'));
});

app.get('/drawing.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'real-time-collab', 'public', 'drawing.html'));
});


let items = [];

io.on('connection', function(socket) {
    const session = socket.handshake.session;
    if (!session || !session.user) {
        socket.disconnect();
        return;
    }

    const username = session.user.username;
    console.log(username, 'connected...');

    // 사용자 입장 메시지 브로드캐스트
    io.emit('msg', `${username}님이 채팅방에 들어왔습니다.`);

    // 메시지 수신 및 브로드캐스트
    socket.on('msg', function(data) {
        console.log(username, ': ', data);
        io.emit('msg', `${username}: ${data}`);
    });

    // 사용자 연결 끊김 메시지 브로드캐스트
    socket.on('disconnect', function() {
        io.emit('msg', `${username}님이 채팅방을 나갔습니다.`);
    });

    // 그림판 이벤트 수신 및 브로드캐스트
    socket.on('drawing', (data) => {
        socket.broadcast.emit('drawing', data);
    });

     // 연결된 클라이언트에게 현재 상태 전송
     socket.emit('updateItems', items);

     // 클라이언트로부터 메시지를 받음
     socket.on('addItem', (item) => {
         items.push(item);
         // 모든 클라이언트에게 업데이트된 아이템 리스트 전송
         io.emit('updateItems', items);
     });
});
// 로그인된 사용자 정보를 클라이언트에 제공하는 라우트 추가
app.get('/session', (req, res) => {
    if (req.session.user) {
        res.json({ username: req.session.user.username });
    } else {
        res.status(401).send('Unauthorized');
    }
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
