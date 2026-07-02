/**
 * Servidor Local/Nuvem Express - Sistema de Controle de Ordem de Serviço
 * Suporta: Banco de Dados em Nuvem MongoDB Atlas ou arquivo local db.json
 * Segurança: Autenticação JWT e criptografia de senhas com Bcrypt
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');
const PUBLIC_PATH = path.join(__dirname, 'public');
const JWT_SECRET = process.env.JWT_SECRET || 'techmanager_super_secret_key_123';

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_PATH));

// --- GESTÃO DE BANCO DE DADOS DUAL (MONGODB ATLAS OU ARQUIVO JSON) ---

let dbMode = 'file'; // 'file' ou 'mongodb'
let mongoDb = null;

// Inicializa a conexão com o banco de dados
async function initDatabase() {
  if (process.env.MONGODB_URI) {
    try {
      const { MongoClient } = require('mongodb');
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      mongoDb = client.db();
      dbMode = 'mongodb';
      console.log('[DB] Conectado ao MongoDB Atlas com sucesso!');
      
      // Certificar que temos um usuário admin cadastrado no MongoDB
      const usersCol = mongoDb.collection('users');
      const adminExists = await usersCol.findOne({ username: 'admin' });
      if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await usersCol.insertOne({
          username: 'admin',
          password: hashedPassword
        });
        console.log('[DB] Usuário admin padrão criado no MongoDB.');
      }
    } catch (err) {
      console.error('[DB] Erro ao conectar ao MongoDB Atlas. Usando banco de dados local db.json...', err);
      setupLocalFileDb();
    }
  } else {
    console.log('[DB] MONGODB_URI não configurada. Usando banco de dados local db.json...');
    setupLocalFileDb();
  }
}

// Configura o banco local se estiver em modo 'file'
function setupLocalFileDb() {
  dbMode = 'file';
  if (!fs.existsSync(DB_PATH)) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    const initialData = {
      orders: [],
      settings: {
        company_data: {
          name: '',
          cnpj: '',
          phone: '',
          email: '',
          address: '',
          warrantyTerms: 'Os termos de garantia cobrem apenas defeitos das peças listadas e substituídas nesta ordem de serviço.',
          logoBase64: ''
        }
      },
      users: [
        {
          username: 'admin',
          password: hashedPassword
        }
      ]
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

// Auxiliares para ler banco de arquivo local
function readLocalFileDb() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return { orders: [], settings: {}, users: [] };
  }
}

function writeLocalFileDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    return false;
  }
}

// --- FUNÇÕES DE INTERAÇÃO COM DADOS (ABSTRAÇÃO DB) ---

async function getOrders() {
  if (dbMode === 'mongodb') {
    return await mongoDb.collection('orders').find().toArray();
  } else {
    return readLocalFileDb().orders || [];
  }
}

async function getOrderById(id) {
  if (dbMode === 'mongodb') {
    return await mongoDb.collection('orders').findOne({ id });
  } else {
    return readLocalFileDb().orders.find(o => o.id === id);
  }
}

async function saveOrUpdateOrder(orderData) {
  if (dbMode === 'mongodb') {
    if (orderData.id) {
      const id = parseInt(orderData.id);
      await mongoDb.collection('orders').updateOne({ id }, { $set: { ...orderData, id } });
      return { ...orderData, id };
    } else {
      // Obter ID sequencial
      const maxOrder = await mongoDb.collection('orders').find().sort({ id: -1 }).limit(1).toArray();
      const newId = maxOrder.length > 0 ? maxOrder[0].id + 1 : 1;
      const newOrder = {
        ...orderData,
        id: newId,
        createdAt: orderData.createdAt || new Date().toISOString()
      };
      await mongoDb.collection('orders').insertOne(newOrder);
      return newOrder;
    }
  } else {
    const db = readLocalFileDb();
    if (orderData.id) {
      const id = parseInt(orderData.id);
      const index = db.orders.findIndex(o => o.id === id);
      if (index !== -1) {
        db.orders[index] = { ...db.orders[index], ...orderData, id };
        writeLocalFileDb(db);
        return db.orders[index];
      }
    } else {
      const maxId = db.orders.reduce((max, o) => o.id > max ? o.id : max, 0);
      const newId = maxId + 1;
      const newOrder = {
        ...orderData,
        id: newId,
        createdAt: orderData.createdAt || new Date().toISOString()
      };
      db.orders.push(newOrder);
      writeLocalFileDb(db);
      return newOrder;
    }
  }
}

async function deleteOrderById(id) {
  if (dbMode === 'mongodb') {
    const res = await mongoDb.collection('orders').deleteOne({ id });
    return res.deletedCount > 0;
  } else {
    const db = readLocalFileDb();
    const index = db.orders.findIndex(o => o.id === id);
    if (index !== -1) {
      db.orders.splice(index, 1);
      writeLocalFileDb(db);
      return true;
    }
    return false;
  }
}

async function getCompanySettings() {
  if (dbMode === 'mongodb') {
    const doc = await mongoDb.collection('settings').findOne({ key: 'company_data' });
    return doc ? doc.value : {};
  } else {
    const db = readLocalFileDb();
    return db.settings ? db.settings.company_data : {};
  }
}

async function saveCompanySettings(settingsData) {
  if (dbMode === 'mongodb') {
    await mongoDb.collection('settings').updateOne(
      { key: 'company_data' },
      { $set: { value: settingsData } },
      { upsert: true }
    );
    return settingsData;
  } else {
    const db = readLocalFileDb();
    db.settings = db.settings || {};
    db.settings.company_data = settingsData;
    writeLocalFileDb(db);
    return settingsData;
  }
}

async function findUser(username) {
  if (dbMode === 'mongodb') {
    return await mongoDb.collection('users').findOne({ username });
  } else {
    const db = readLocalFileDb();
    return db.users ? db.users.find(u => u.username === username) : null;
  }
}

async function updateUserPassword(username, newHashedPassword) {
  if (dbMode === 'mongodb') {
    await mongoDb.collection('users').updateOne({ username }, { $set: { password: newHashedPassword } });
    return true;
  } else {
    const db = readLocalFileDb();
    const u = db.users.find(x => x.username === username);
    if (u) {
      u.password = newHashedPassword;
      writeLocalFileDb(db);
      return true;
    }
    return false;
  }
}

// --- MIDDLEWARE DE AUTENTICAÇÃO JWT ---

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Faça login para continuar.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
    req.user = decoded;
    next();
  });
}

// --- ROTAS DA API DE AUTENTICAÇÃO (LOGIN / SENHA) ---

// Login do Usuário
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  try {
    const user = await findUser(username);
    if (!user) {
      return res.status(400).json({ error: 'Usuário ou senha incorretos.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Usuário ou senha incorretos.' });
    }

    // Gerar Token JWT com validade de 30 dias
    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao realizar autenticação.' });
  }
});

// Alterar Senha do Administrador
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const username = req.user.username;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' });
  }

  try {
    const user = await findUser(username);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Senha atual incorreta.' });
    }

    // Salvar nova senha criptografada
    const hashed = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(username, hashed);
    res.json({ message: 'Senha alterada com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao alterar a senha.' });
  }
});

// --- ROTAS PROTEGIDAS DA API REST (EXIGEM LOGIN) ---

// Obter todas as Ordens de Serviço
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await getOrders();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar ordens de serviço.' });
  }
});

// Obter uma única OS por ID
app.get('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const order = await getOrderById(id);
    if (order) {
      res.json(order);
    } else {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter ordem de serviço.' });
  }
});

// Salvar ou Atualizar uma OS
app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orderData = req.body;
    const saved = await saveOrUpdateOrder(orderData);
    res.json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar ordem de serviço.' });
  }
});

// Excluir uma OS
app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const success = await deleteOrderById(id);
    if (success) {
      res.json({ message: 'Ordem de serviço excluída com sucesso.' });
    } else {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir ordem de serviço.' });
  }
});

// Obter Configurações
app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    const settings = await getCompanySettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar configurações.' });
  }
});

// Salvar Configurações
app.post('/api/settings', authenticateToken, async (req, res) => {
  try {
    const settingsData = req.body;
    const currentCompany = await getCompanySettings() || {};
    
    // Mesclar dados com logo existente se não enviado no payload
    const finalSettings = {
      ...currentCompany,
      ...settingsData
    };
    
    const saved = await saveCompanySettings(finalSettings);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

// Importar Backup completo (Substitui todo o banco)
app.post('/api/backup/import', authenticateToken, async (req, res) => {
  try {
    const backupData = req.body;
    
    if (!backupData.orders || !backupData.settings) {
      return res.status(400).json({ error: 'Formato de backup inválido.' });
    }

    const companyData = backupData.settings.company_data || backupData.settings;

    if (dbMode === 'mongodb') {
      // Limpar coleções atuais e importar
      await mongoDb.collection('orders').deleteMany({});
      if (backupData.orders.length > 0) {
        await mongoDb.collection('orders').insertMany(backupData.orders);
      }
      await saveCompanySettings(companyData);
    } else {
      const db = readLocalFileDb();
      const backupDb = {
        orders: backupData.orders,
        settings: { company_data: companyData },
        users: db.users // Manter usuários para não trancar login local
      };
      writeLocalFileDb(backupDb);
    }
    
    res.json({ message: 'Banco de dados restaurado com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao importar backup no servidor.' });
  }
});

// Rota curinga para servir o index.html (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
});

// --- INICIALIZAÇÃO DO SERVIDOR ---

// Detectar IP local ativo do computador na rede (para fins de debug local)
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Iniciar conexão com banco e ligar porta Express
initDatabase().then(() => {
  app.listen(PORT, () => {
    const localIp = getLocalIpAddress();
    console.log('\n======================================================');
    console.log('       SISTEMA DE CONTROLE DE ORDEM DE SERVIÇO        ');
    console.log('======================================================');
    console.log(`Servidor ativo com sucesso na porta ${PORT}!`);
    console.log(`Modo de Banco de Dados ativo: [${dbMode.toUpperCase()}]`);
    console.log(`\n -> Acesso neste computador:   http://localhost:${PORT}`);
    console.log(` -> Acesso em outros na rede:  http://${localIp}:${PORT}`);
    console.log('======================================================\n');
  });
});
