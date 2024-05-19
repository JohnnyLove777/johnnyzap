const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const pm2 = require('pm2');
const fsp = fs.promises; // Para operações assíncronas baseadas em promessas
const axios = require('axios');
const Jimp = require('jimp');
const fetch = require('node-fetch');
const WebSocket = require('ws');
const socketIo = require('socket.io');
const http = require('http');
const https = require('https');
const OpenAI = require('openai');
const { spawn } = require('child_process');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);

const johnny = require('./johnnyFunctions');
const db = require('./databaseFunctions');

/*const instanceName = 'JohnnyEVO';
const apiKeyEVO = 'f594jqci37r72wsr7e2czj';*/

const DATABASE_FILE_TYPE = 'typebotDB.json';

const db_length = 600;

console.log("Bem-vindo ao JohnnyZap Inteligênte 1.5 - A Integração mais completa Typebot + Whatsapp + OpenAI e ElevenLabs");

// Conectando ao daemon do PM2
pm2.connect((err) => {
    if (err) {
        console.error('Erro ao conectar-se ao PM2:', err);
        process.exit(1);
    }
  
    // Adicionamos os eventos de captura
    pm2.launchBus((err, bus) => {
        if (err) {
            console.error('Erro ao lançar o bus do PM2:', err);
            process.exit(1);
        }
  
        // Listener para o evento de erro
        bus.on('log:err', (data) => {
            if (data.process.name === 'johnnyzap') {                 
                    setTimeout(() => {
                        pm2.restart('johnnyzap', (err) => {
                            if (err) {
                                console.error('Erro ao tentar reiniciar o johnnyzap:', err);
                                return;
                            }
                            console.log('johnnyzap reiniciado com sucesso.');
                        });
                    }, 10000); // 10 segundos                
            }
        });
    });
});

// Rotinas que implementam o disparo de mensagens em massa pelo Dashboard

let timeoutHandles = [];
let isCampaignRunning = false;

// Função para limpar todos os timeouts e parar a campanha
function stopCampaign() {
  timeoutHandles.forEach(clearTimeout);
  timeoutHandles = [];
  isCampaignRunning = false;
}

// Função para iniciar o disparo de mensagens
function startCampaign(data) {
  const { listaleads, minDelay, maxDelay, startPosition, endPosition, fluxoSelecionado } = data;
  let listaContatos;

  try {
    // Supondo que você tenha uma função para ler o arquivo JSON
    listaContatos = readJSONFile(`./leadslista/${listaleads}`);
  } catch (error) {
    console.error('Erro ao ler o arquivo de leads', error);
    // Envie uma mensagem de erro para o cliente
    return;
  }

  const subListaContatos = listaContatos.slice(startPosition, endPosition + 1);
  let currentContactIndex = 0;

  isCampaignRunning = true;

  const sendNextMessage = () => {
    if (currentContactIndex < subListaContatos.length && isCampaignRunning) {
      const contato = subListaContatos[currentContactIndex];
      // Inserir aqui rotina de disparo do gatilho de V2 para o contato
      dispararFluxoV2ParaContato(contato, fluxoSelecionado);

      const delayAleatorio = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      // Supondo que você tenha uma função para enviar uma mensagem de status
      sendStatusMessage(`Disparo ${currentContactIndex + 1}/${subListaContatos.length}: Enviei o bloco de remarketing ao número: ${contato} e com delay de ${delayAleatorio}`);

      currentContactIndex++;
      const timeoutHandle = setTimeout(sendNextMessage, delayAleatorio);
      timeoutHandles.push(timeoutHandle);
    } else {
      stopCampaign(); // Parar a campanha quando todos os contatos forem processados ou quando a campanha for cancelada
    }
  };

  // Iniciar a campanha
  sendNextMessage();
}

// Supondo que você tenha uma função para enviar mensagens de status
function sendStatusMessage(message) {
  console.log(message);
  // Envie a mensagem para a interface do usuário ou algum sistema de log
}

// Fim das rotinas que implementam o disparo de mensagens em massa via Dashboard

const appWeb = express();
const serverWeb = http.createServer(appWeb);
const wss = new WebSocket.Server({ server: serverWeb });

appWeb.use(express.static('public'));

wss.on('connection', function connection(ws) {
    ws.on('message', function incoming(message) {
      //console.log('received: %s', message);
      // Tentativa de processar a mensagem JSON
      try {
        const parsedMessage = JSON.parse(message);
        
        // Verificar se a ação é de registrar JohnnyZap
        if (parsedMessage.action === 'registerTypeZap') {
            console.log('Dados recebidos:', parsedMessage.data);
            const { url, instanciaNome, instanciaChave, openAIKey, elevenLabsKey } = parsedMessage.data;
        
            try {
                // Adiciona o novo objeto no sistema
                db.addObjectSystem(instanciaNome, url, openAIKey || '', elevenLabsKey || '', instanciaChave);                
                console.log('JohnnyZap Instância registrada com sucesso! Pow pow tei tei, pra cima deles!!');
            } catch (error) {
                ws.send(`Erro ao registrar JohnnyZap: ${error.message}`);
            }
        }        
        else if (parsedMessage.action === 'atualizarLista') {
          //console.log('Apertou botão para atualizar lista');
      
          // Define o caminho para o arquivo typebotDB.json
          const filePath = path.join(__dirname, 'typebotDB.json');
      
          // Lê o conteúdo do arquivo
          fs.readFile(filePath, 'utf8', (err, data) => {
              if (err) {
                  console.error('Erro ao ler o arquivo:', err);
                  // Informa ao cliente que houve um erro ao ler o arquivo
                  ws.send(JSON.stringify({ error: 'Erro ao acessar os dados dos fluxos.' }));
                  return;
              }
      
              // Se não houver erro, parseia os dados do JSON e envia para o cliente
              try {
                  const fluxos = JSON.parse(data);
                  ws.send(JSON.stringify({
                      action: 'listaAtualizada',
                      data: fluxos
                  }));
                  //console.log('Lista de fluxos enviada ao cliente.');
              } catch (parseError) {
                  console.error('Erro ao parsear os dados do arquivo:', parseError);
                  // Informa ao cliente que houve um erro ao processar os dados
                  ws.send(JSON.stringify({ error: 'Erro ao processar os dados dos fluxos.' }));
              }
          });
        }
        else if (parsedMessage.action === 'excluirFluxo') {
          const { instanceName , nome } = parsedMessage.data;
          //console.log(`Apertou botão para excluir fluxo: ${parsedMessage.data.nome}`);
          db.removeFromDB(instanceName,nome);
          // Aqui você pode adicionar a lógica para excluir um fluxo específico
          ws.send(`Fluxo ${parsedMessage.data.nome} excluído com sucesso!`);
        }
        else if (parsedMessage.action === 'confirmarAdicao') {
          //console.log('Apertou botão para confirmar adição');
          const { instanceName, url, nome, gatilho } = parsedMessage.data;
          //console.log(`Registrando JohnnyZap com URL: ${url}, Nome do Fluxo: ${nome}, Gatilho do Fluxo: ${gatilho}`);        
          const typebotConfig = {            
            url_registro: url,
            gatilho: gatilho,
            name: nome
            };
            db.addToDB(instanceName,typebotConfig);
        }
        else if (parsedMessage.action === 'atualizarListaRapida') {
          //console.log('Apertou botão para atualizar lista rapida');
      
          // Define o caminho para o arquivo typebotDB.json
          const filePath = path.join(__dirname, 'typebotDBV2.json');
      
          // Lê o conteúdo do arquivo
          fs.readFile(filePath, 'utf8', (err, data) => {
              if (err) {
                  console.error('Erro ao ler o arquivo:', err);
                  // Informa ao cliente que houve um erro ao ler o arquivo
                  ws.send(JSON.stringify({ error: 'Erro ao acessar os dados dos fluxos.' }));
                  return;
              }
      
              // Se não houver erro, parseia os dados do JSON e envia para o cliente
              try {
                  const fluxos = JSON.parse(data);
                  ws.send(JSON.stringify({
                      action: 'listaRapidaAtualizada',
                      data: fluxos
                  }));
                  //console.log('Lista de fluxos rapidos enviada ao cliente.');
              } catch (parseError) {
                  console.error('Erro ao parsear os dados do arquivo:', parseError);
                  // Informa ao cliente que houve um erro ao processar os dados
                  ws.send(JSON.stringify({ error: 'Erro ao processar os dados dos fluxos.' }));
              }
          });
        }
        else if (parsedMessage.action === 'excluirRapida') {
          const { instanceName, nome } = parsedMessage.data;
          //console.log(`Apertou botão para excluir fluxo rapido: ${parsedMessage.data.nome}`);
          db.removeFromDBTypebotV2(instanceName,nome);
          // Aqui você pode adicionar a lógica para excluir um fluxo específico
          ws.send(`Fluxo Rapido ${parsedMessage.data.nome} excluído com sucesso!`);
        }
        else if (parsedMessage.action === 'confirmarAdicaoRapida') {
          //console.log('Apertou botão para confirmar adição');
          const { instanceName , nome, gatilho } = parsedMessage.data;
          //console.log(`Registrando Resposta Rapida, Nome do Fluxo: ${nome}, Frase de Disparo: ${gatilho}`);        
          const typebotConfig = {
            gatilho: gatilho,
            name: nome
            };
            db.addToDBTypebotV2(instanceName,nome,typebotConfig);
        }
        else if (parsedMessage.action === 'atualizarListaRmkt') {
          //console.log('Apertou botão para atualizar lista rapida');
      
          // Define o caminho para o arquivo typebotDB.json
          const filePath = path.join(__dirname, 'typebotDBV3.json');
      
          // Lê o conteúdo do arquivo
          fs.readFile(filePath, 'utf8', (err, data) => {
              if (err) {
                  console.error('Erro ao ler o arquivo:', err);
                  // Informa ao cliente que houve um erro ao ler o arquivo
                  ws.send(JSON.stringify({ error: 'Erro ao acessar os dados dos fluxos.' }));
                  return;
              }
      
              // Se não houver erro, parseia os dados do JSON e envia para o cliente
              try {
                  const fluxos = JSON.parse(data);
                  ws.send(JSON.stringify({
                      action: 'listaRmktAtualizada',
                      data: fluxos
                  }));
                  //console.log('Lista de remarketing enviada ao cliente.');
              } catch (parseError) {
                  console.error('Erro ao parsear os dados do arquivo:', parseError);
                  // Informa ao cliente que houve um erro ao processar os dados
                  ws.send(JSON.stringify({ error: 'Erro ao processar os dados dos fluxos.' }));
              }
          });
        }
        else if (parsedMessage.action === 'excluirRmkt') {
          const { instanceName , url } = parsedMessage.data;
          //console.log(`Apertou botão para excluir remarketing: ${parsedMessage.data.url}`);
          db.removeFromDBTypebotV3(instanceName,url);
          // Aqui você pode adicionar a lógica para excluir um fluxo específico
          ws.send(`Remarketing ${parsedMessage.data.url} excluído com sucesso!`);
        }
        else if (parsedMessage.action === 'confirmarAdicaoRmkt') {
         // console.log('Apertou botão para confirmar adição');
          const { instanceName , url, nome, dias } = parsedMessage.data;
          //console.log(`Registrando Remarketing, Nome do Fluxo: ${nome}, Dias para Disparo: ${dias}`);        
          const urlRmkt = url;
          const typebotConfig = {
          disparo: `${dias}`,
          name: nome
          };
          db.addToDBTypebotV3(instanceName,urlRmkt,typebotConfig);
        }
        else if (parsedMessage.action === 'atualizarGrupo') {
          //console.log('Apertou botão para atualizar grupo');
      
          // Define o caminho para o arquivo typebotDB.json
          const filePath = path.join(__dirname, 'typebotDBV5.json');
      
          // Lê o conteúdo do arquivo
          fs.readFile(filePath, 'utf8', (err, data) => {
              if (err) {
                  console.error('Erro ao ler o arquivo:', err);
                  // Informa ao cliente que houve um erro ao ler o arquivo
                  ws.send(JSON.stringify({ error: 'Erro ao acessar os dados dos fluxos.' }));
                  return;
              }
      
              // Se não houver erro, parseia os dados do JSON e envia para o cliente
              try {
                  const grupos = JSON.parse(data);
                  // Iterar sobre os grupos e extrair os IDs
                  const fluxos = Object.keys(grupos).map(id => {
                  return { name: id };
                  });
                  ws.send(JSON.stringify({
                      action: 'listaGrupoAtualizada',
                      data: fluxos
                  }));
                  //console.log('Lista de remarketing enviada ao cliente.');
              } catch (parseError) {
                  console.error('Erro ao parsear os dados do arquivo:', parseError);
                  // Informa ao cliente que houve um erro ao processar os dados
                  ws.send(JSON.stringify({ error: 'Erro ao processar os dados dos fluxos.' }));
              }
          });
        }
        else if (parsedMessage.action === 'excluirGrupo') {
          const { instanceName , name } = parsedMessage.data;
          //console.log(`Apertou botão para excluir grupo: ${parsedMessage.data.name}`);
          db.removeFromDBTypebotV5(name);
          // Aqui você pode adicionar a lógica para excluir um fluxo específico
          ws.send(`Grupo ${parsedMessage.data.name} excluído com sucesso!`);
        }
        else if (parsedMessage.action === 'uploadLeads') {
          const leads = JSON.parse(parsedMessage.data);
          const fileName = parsedMessage.fileName; // Extrai o nome do arquivo da mensagem  
          const dir = 'leadslista';
          if (!fs.existsSync(dir)){
              fs.mkdirSync(dir, { recursive: true });
          }
      
          fs.writeFile(`${dir}/${fileName}`, JSON.stringify(leads, null, 2), 'utf8', (err) => {
              if (err) {
                  console.error('Erro ao salvar o arquivo de leads', err);
                  ws.send(JSON.stringify({ action: 'error', message: 'Erro ao carregar a lista de leads' }));
              } else {
                  ws.send(JSON.stringify({ action: 'success', message: 'Lista de leads carregada com sucesso' }));
              }
          });
        }
        else if (parsedMessage.action === 'uploadMedia') {
          const mediaData = parsedMessage.data;
          const fileName = parsedMessage.fileName; // Extrai o nome do arquivo da mensagem
          const dir = 'media';
          
          // Verifica se o diretório existe e, se não, cria-o de forma recursiva
          if (!fs.existsSync(dir)){
              fs.mkdirSync(dir, { recursive: true });
          }
      
          const filePath = `${dir}/${fileName}`;
          
          // Cria um fluxo de escrita de arquivo
          const fileStream = fs.createWriteStream(filePath);
      
          // Evento de erro do fluxo de escrita
          fileStream.on('error', (err) => {
              console.error('Erro ao salvar o arquivo de mídia', err);
              ws.send(JSON.stringify({ action: 'error', message: 'Erro ao carregar o arquivo de mídia' }));
          });
      
          // Evento de finalização do fluxo de escrita
          fileStream.on('finish', () => {
              ws.send(JSON.stringify({ action: 'success', message: 'Arquivo de mídia carregado com sucesso' }));
          });
      
          // Escreve os dados da mídia no arquivo utilizando o fluxo de escrita
          fileStream.write(mediaData, 'base64');
      
          // Finaliza o fluxo de escrita
          fileStream.end();
        }
  
  
        else if (parsedMessage.action === 'iniciarCampanha') {
          //console.log(JSON.stringify(parsedMessage.data));
          // Coloque aqui a rotina de inicio do disparo de mensagens
          startCampaign(parsedMessage.data);
        }
        else if (parsedMessage.action === 'pararCampanha') {
          //console.log('Servidor Parar check!!');
          // Coloque aqui um ponto de parada e limpeza do cache do disparo de mensagens
          stopCampaign();
          // Enviar confirmação de parada da campanha para o usuário
          sendStatusMessage('Campanha de disparo de mensagens foi cancelada com sucesso.');
        }
  
        else if (parsedMessage.action === 'atualizarListaLeads') {
          const directoryPath = path.join(__dirname, 'leadslista');
          
          // Lê o diretório para pegar os nomes dos arquivos
          fs.readdir(directoryPath, (err, files) => {
              if (err) {
                  console.error('Erro ao ler a pasta:', err);
                  ws.send(JSON.stringify({ error: 'Erro ao acessar a lista de leads.' }));
                  return;
              }
              
              // Filtra apenas arquivos .json
              const jsonFiles = files.filter(file => path.extname(file) === '.json');
              
              ws.send(JSON.stringify({
                  action: 'listaLeadsAtualizada',
                  data: jsonFiles
              }));
              //console.log('Lista de leads enviada ao cliente.');
          });
        }
        else if (parsedMessage.action === 'atualizarListaFluxos') {
          //console.log('Apertou botão para atualizar lista de fluxos');
          
          // Define o caminho para o arquivo typebotDBV2.json
          const filePath = path.join(__dirname, 'typebotDBV2.json');
          
          // Lê o conteúdo do arquivo
          fs.readFile(filePath, 'utf8', (err, data) => {
              if (err) {
                  console.error('Erro ao ler o arquivo:', err);
                  // Informa ao cliente que houve um erro ao ler o arquivo
                  ws.send(JSON.stringify({ error: 'Erro ao acessar os dados dos fluxos.' }));
                  return;
              }
          
              // Se não houver erro, parseia os dados do JSON e envia para o cliente
              try {
                  const fluxos = JSON.parse(data);
                  const fluxosArray = Object.keys(fluxos).map(key => ({
                      name: fluxos[key].name,
                      gatilho: fluxos[key].gatilho
                  }));
                  ws.send(JSON.stringify({
                      action: 'listaFluxosAtualizada',
                      data: fluxosArray
                  }));
                  //console.log('Lista de fluxos enviada ao cliente.');
              } catch (parseError) {
                  console.error('Erro ao parsear os dados do arquivo:', parseError);
                  // Informa ao cliente que houve um erro ao processar os dados
                  ws.send(JSON.stringify({ error: 'Erro ao processar os dados dos fluxos.' }));
              }
          });
        }
  
      } catch (e) {
        console.error('Erro ao processar a mensagem:', e);
        ws.send('Erro ao processar a mensagem recebida');
      }
    });
  
    ws.send('Conexão WebSocket estabelecida com sucesso!');
});

serverWeb.listen(3031, function() {
    console.log('Servidor do JohnnyZap com o Dashboard em http://localhost:3031');
});

//Mecanismo para criar pasta

function createFolderIfNotExists(folderPath) {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log(`Pasta criada: ${folderPath}`);
    } else {
        console.log(`Pasta já existe: ${folderPath}`);
    }
}
  
// Caminhos das pastas
const leadsPath = path.join(__dirname, 'leadslista');
const registroPath = path.join(__dirname, 'registrolista');
const audioBrutoPath = path.join(__dirname, 'audiobruto');
const audioLiquidoPath = path.join(__dirname, 'audioliquido');
const audioSintetizadoPath = path.join(__dirname, 'audiosintetizado');
const imagemPath = path.join(__dirname, 'imagemliquida');
  
// Criar as pastas
createFolderIfNotExists(leadsPath);
createFolderIfNotExists(registroPath);
createFolderIfNotExists(audioBrutoPath);
createFolderIfNotExists(audioLiquidoPath);
createFolderIfNotExists(audioSintetizadoPath);
createFolderIfNotExists(imagemPath);
  
//Fim do mecanismo para criar pasta

// Configs ElevenLabs
const voice_SETTINGS = {  
    similarity_boost: 0.75, 
    stability: 0.5,       
    style: 0,           
    use_speaker_boost: true
};

// Inicializando banco de dados das Instancias
db.initializeDBSystem();
// Inicializando banco de dados dos fluxos do Typebot
db.initializeDB();
// Inicializando banco de dados das respostas Rápidas
db.initializeDBTypebotV2();
// Inicializando banco de dados do remarketing
db.initializeDBTypebotV3();
// Inicializando banco de dados dos disparos agendados
db.initializeDBTypebotV4();
// Inicializando banco de dados dos disparos para grupos
db.initializeDBTypebotV5();
// Inicializando banco de dados dos disparos agendados de respsotas rapidas (Novo Remarketing)
db.initializeDBTypebotV6();

// Middleware para processar JSON
app.use(express.json());

// Servir a pasta "media" estaticamente
app.use('/media', express.static(path.join(__dirname, 'media')));

// Cria a pasta "media" se não existir
if (!fs.existsSync('media')) {
  fs.mkdirSync('media');
}

async function waitWithDelay(inputString) {
    // Verifica se a string começa com '!wait'
    if (inputString.startsWith('!wait')) {
      // Extrai o número da string usando expressões regulares
      const match = inputString.match(/\d+/);
      
      if (match) {
        // Converte o número para um valor inteiro
        const delayInSeconds = parseInt(match[0]);
        
        // Aguarda o atraso usando o valor extraído
        await new Promise(resolve => setTimeout(resolve, delayInSeconds * 1000));
        
        //console.log(`Aguardou ${delayInSeconds} segundos.`);
      } else {
        const defaultDelayInSeconds = 3;
        await new Promise(resolve => setTimeout(resolve, defaultDelayInSeconds * 1000));
      }
    }
}

async function createSessionJohnny(datafrom, dataid, url_registro, fluxo, instanceName, apiKeyEVO) {   
  
    const reqData = JSON.stringify({
      isStreamEnabled: true,
      message: "string", // Substitua se necessário
      resultId: "string", // Substitua se necessário
      isOnlyRegistering: false,
      prefilledVariables: {
        number: datafrom.split('@')[0]
      },
    });
  
    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: url_registro,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      data: reqData
    };
  
    try {
      const response = await axios.request(config);
  
      const messages = response.data.messages;
  
      if (!db.existsDB(instanceName,datafrom)) {
        db.addObject(instanceName,datafrom, response.data.sessionId, datafrom.replace(/\D/g, ''), dataid, 'typing', fluxo, false, "active", false, false, null, null, null, db_length);
      }    
      
      for (const message of messages){
        if (!["text", "image", "audio", "video"].includes(message.type)) {
          console.log(`Tipo '${message.type}' não permitido. Pulando registro com ID: ${message.id}`);
          continue; // Pula para a próxima iteração do laço
        }
        if (message.type === 'text') {
          let formattedText = '';
          for (const richText of message.content.richText) {
            for (const element of richText.children) {
              let text = '';
              //console.log(JSON.stringify(element));
      
              if (element.text) {
                text = element.text;
              }
              if (element.url) {
                text = element.url;
              }
              else if (element.type === 'p') {
                // Extrai o valor de 'children' assumindo que o primeiro item contém o texto desejado
                text = element.children[0].text;             
              }
              else if (element.type === 'inline-variable') {              
                text = element.children[0].children[0].text;              
              }
      
              if (element.bold) {
                text = `*${text}*`;
              }
              if (element.italic) {
                text = `_${text}_`;
              }
              if (element.underline) {
                text = `~${text}~`;
              }
      
              formattedText += text;
            }
            formattedText += '\n';
          }
      
          formattedText = formattedText.replace(/\n$/, '');
          if (formattedText.startsWith('!wait')) {
            await waitWithDelay(formattedText);
          }
          if (formattedText.startsWith('!caption')) {
            const caption = formattedText.split(" ")[1];
            db.updateCaption(instanceName,datafrom, caption);
          }
          if (formattedText.startsWith('!fim')) {
            if (db.existsDB(instanceName,datafrom)) {
              db.updateFlow(instanceName,datafrom, "inactive");
            }
          }
          if (formattedText.startsWith('!optout')) {
            if (db.existsDB(instanceName,datafrom)) {
              db.updateOptout(instanceName,datafrom, true);
              db.removeFromDBTypebotV4(instanceName,datafrom);
            }
          }
          if (formattedText.startsWith('!reiniciar')) {
            if (db.existsDB(instanceName,datafrom)) {
              db.deleteObject(instanceName,datafrom);           
            }
          }          
          if (formattedText.startsWith('!directmessage')) {
            const partes = formattedText.split(' ');
  
            const destino = partes[1];
            const conteudo = partes.slice(2).join(' ');

            johnny.EnviarTexto(destino, conteudo, 2000, apiKeyEVO, instanceName);
            db.updateDelay(instanceName,datafrom, null);
            
          }                 
          if (!(formattedText.startsWith('!wait')) && !(formattedText.startsWith('!caption')) && !(formattedText.startsWith('!fim')) && !(formattedText.startsWith('!optout')) && !(formattedText.startsWith('!reiniciar')) && !(formattedText.startsWith('!media')) && !(formattedText.startsWith('!directmessage')) && !(formattedText.startsWith('Invalid message. Please, try again.')) && !(formattedText.startsWith('!rapidaagendada')) && !(formattedText.startsWith('!entenderaudio')) && !(formattedText.startsWith('!entenderimagem')) && !(formattedText.startsWith('!audioopenai')) && !(formattedText.startsWith('!audioeleven')) && !(formattedText.startsWith('!imagemopenai'))) {
            johnny.EnviarTexto(datafrom, formattedText, 2000, apiKeyEVO, instanceName);  
            //db.updateDelay(datafrom, null);          
          }      
        }
        if (message.type === 'image') {          
            const url_target = message.content.url;
            johnny.EnviarImagem(datafrom, url_target, db.readCaption(instanceName,datafrom), 2000, apiKeyEVO, instanceName);
            //db.updateDelay(datafrom, null);
            db.updateCaption(instanceName,datafrom, null);        
        }                          
        if (message.type === 'video') {          
            const url_target = message.content.url;
            johnny.EnviarVideo(datafrom, url_target, db.readCaption(instanceName,datafrom), 2000, apiKeyEVO, instanceName);
            //db.updateDelay(datafrom, null);
            db.updateCaption(instanceName,datafrom, null);
        }                            
        if (message.type === 'audio') {          
            const url_target = message.content.url;
            johnny.EnviarAudio(datafrom, url_target, 2000, apiKeyEVO, instanceName);
            //db.updateDelay(datafrom, null);
        } 
      }

      if(db.existsDB(instanceName,datafrom)){
        db.updateSessionId(instanceName,datafrom, response.data.sessionId);
        db.updateId(instanceName,datafrom, dataid);
        db.updateInteract(instanceName,datafrom, 'done');
        db.updateFlow(instanceName,datafrom, "active");
        db.updateName(instanceName,datafrom, fluxo);
      }     
    } catch (error) {
      console.log(error);
    }
}

// Listener de Mensagem Recebida e Enviada
app.post('/webhook/messages-upsert', async (req, res) => {
    
    const event = req.body;
  
    const messageData = event.data;
    const instanceName = event.instance;  

    const instanceData = db.readMapSystem(instanceName);
    if (!instanceData) {
    console.error(`Instância ${instanceName} não encontrada. Processamento encerrado.`);
    return;
    }
    const apiKeyEVO = instanceData.apiKeyEVO;
    const messageBody = messageData.message.conversation; // Mensagem enviada
    const remoteJid = messageData.key.remoteJid; // Numero de wpp do remetente
    const messageId = messageData.key.id; // ID da mensagem original para reações e baixar mídia
  
    try {
      const fromMe = await johnny.isFromMe(event);
      //console.log(`fromMe: ${fromMe}`);
  
      if (fromMe) {
        // Coisas aqui
      } else if (!fromMe) {
           
        const typebotKey = await db.readFluxo(instanceName,remoteJid);

        if (!typebotKey) {
            if (remoteJid.endsWith('@s.whatsapp.net')) {
              const typebotConfigs = db.readJSONFile(DATABASE_FILE_TYPE); // Lê os dados do arquivo JSON
              for (const key in typebotConfigs) {
                  if (typebotConfigs.hasOwnProperty(key)) {
                      const typebotConfig = typebotConfigs[key];              
                      
                      // Verifica se a mensagem corresponde ao gatilho, ou se o gatilho é "null" e a mensagem não é nula
                      if ((typebotConfig.gatilho === messageBody) || (typebotConfig.gatilho === "null")) {
                          // Inicia a sessão com o Typebot correspondente
                          await createSessionJohnny(remoteJid, messageId, typebotConfig.url_registro, typebotConfig.name, instanceName, apiKeyEVO);
                          //await scheduleRemarketing(typebotConfig.name, msg.from, msg);
                          break; // Sai do loop após encontrar o gatilho correspondente
                      }
                  }
              }
            }    
        } else {
            if (db.existsDB(instanceName,remoteJid) && remoteJid.endsWith('@s.whatsapp.net') && db.readInteract(instanceName,remoteJid) === 'done' && db.readId(instanceName,remoteJid) !== messageId && db.readFlow(instanceName,remoteJid) === "active"){
              db.updateInteract(instanceName,remoteJid, 'typing');
              db.updateId(instanceName,remoteJid, messageId);
                
                const sessionId = await db.readSessionId(instanceName,remoteJid);                
                db.updateNextAudio(instanceName,remoteJid, false);
                db.updateNextImage(instanceName,remoteJid, false);
                const chaturl = `${db.readInstanceURL(instanceName,instanceName).url_chat}${sessionId}/continueChat`;

                //const content = await processMessageIA(msg);
                let content = "N/A";
                if(messageBody){
                    content = messageBody;
                }
                
                const reqData = {
                  message: content,
                };
              
                const config = {
                  method: 'post',
                  maxBodyLength: Infinity,
                  url: chaturl,
                  headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                  },
                  data: JSON.stringify(reqData),
                };
              
                try {
                  const response = await axios.request(config);
                  //console.log(JSON.stringify(response.data));
                  const messages = response.data.messages;
                  //console.log(JSON.stringify(messages));                  
                  for (const message of messages){
                    if (!["text", "image", "audio", "video"].includes(message.type)) {
                      console.log(`Tipo '${message.type}' não permitido. Pulando registro com ID: ${message.id}`);
                      continue; // Pula para a próxima iteração do laço
                    }
                    if (message.type === 'text') {
                      let formattedText = '';
                      for (const richText of message.content.richText) {
                        for (const element of richText.children) {
                          let text = '';
                          //console.log(JSON.stringify(element));
                  
                          if (element.text) {
                            text = element.text;
                          }
                          if (element.url) {
                            text = element.url;
                          }
                          else if (element.type === 'p') {
                            // Extrai o valor de 'children' assumindo que o primeiro item contém o texto desejado
                            text = element.children[0].text;             
                          }
                          else if (element.type === 'inline-variable') {              
                            text = element.children[0].children[0].text;              
                          }
                  
                          if (element.bold) {
                            text = `*${text}*`;
                          }
                          if (element.italic) {
                            text = `_${text}_`;
                          }
                          if (element.underline) {
                            text = `~${text}~`;
                          }
                  
                          formattedText += text;
                        }
                        formattedText += '\n';
                      }
                  
                      formattedText = formattedText.replace(/\n$/, '');
                      if (formattedText.startsWith('!wait')) {
                        await waitWithDelay(formattedText);
                      }
                      if (formattedText.startsWith('!caption')) {
                        const caption = formattedText.split(" ")[1];
                        db.updateCaption(instanceName,remoteJid, caption);
                      }
                      if (formattedText.startsWith('!fim')) {
                        if (db.existsDB(instanceName,remoteJid)) {
                          db.updateFlow(instanceName,remoteJid, "inactive");
                        }
                      }
                      if (formattedText.startsWith('!optout')) {
                        if (db.existsDB(instanceName,remoteJid)) {
                          db.updateOptout(instanceName,remoteJid, true);
                          db.removeFromDBTypebotV4(instanceName,remoteJid);
                        }
                      }
                      if (formattedText.startsWith('!reiniciar')) {
                        if (db.existsDB(instanceName,remoteJid)) {
                          db.deleteObject(instanceName,remoteJid);
                        }
                      }
                      if (formattedText.startsWith('!directmessage')) {
                        const partes = formattedText.split(' ');
              
                        const destino = partes[1];
                        const conteudo = partes.slice(2).join(' ');
            
                        johnny.EnviarTexto(destino, conteudo, 2000, apiKeyEVO, instanceName);
                        //db.updateDelay(remoteJid, null);
                        
                      }                     
                      if (!(formattedText.startsWith('!wait')) && !(formattedText.startsWith('!caption')) && !(formattedText.startsWith('!fim')) && !(formattedText.startsWith('!optout')) && !(formattedText.startsWith('!reiniciar')) && !(formattedText.startsWith('!media')) && !(formattedText.startsWith('!directmessage')) && !(formattedText.startsWith('Invalid message. Please, try again.')) && !(formattedText.startsWith('!rapidaagendada')) && !(formattedText.startsWith('!entenderaudio')) && !(formattedText.startsWith('!entenderimagem')) && !(formattedText.startsWith('!audioopenai')) && !(formattedText.startsWith('!audioeleven')) && !(formattedText.startsWith('!imagemopenai'))) {
                        johnny.EnviarTexto(remoteJid, formattedText, 2000, apiKeyEVO, instanceName);  
                        //db.updateDelay(remoteJid, null);
                      }                                                    
                    }
                    if (message.type === 'image') {          
                        const url_target = message.content.url;
                        johnny.EnviarImagem(remoteJid, url_target, db.readCaption(instanceName,remoteJid), 2000, apiKeyEVO, instanceName);
                        //db.updateDelay(remoteJid, null);
                        db.updateCaption(instanceName,remoteJid, null);        
                    }                          
                    if (message.type === 'video') {          
                        const url_target = message.content.url;
                        johnny.EnviarVideo(remoteJid, url_target, db.readCaption(instanceName,remoteJid), 2000, apiKeyEVO, instanceName);
                        //db.updateDelay(remoteJid, null);
                        db.updateCaption(instanceName,remoteJid, null);
                    }                            
                    if (message.type === 'audio') {          
                        const url_target = message.content.url;
                        johnny.EnviarAudio(remoteJid, url_target, 2000, apiKeyEVO, instanceName);
                        //db.updateDelay(remoteJid, null);
                    }  
                                            
                  }                  
                  db.updateInteract(instanceName,remoteJid, 'done');
                } catch (error) {
                  console.log(error);
                }        
            } 
           } 

      }
  
      res.sendStatus(200);
    } catch (error) {
      console.error('Erro ao processar a mensagem:', error);
      res.sendStatus(500);
    }
  });

// Porta onde o servidor vai escutar
const PORT = 3030;
app.listen(PORT, () => {
  console.log(`Servidor Webhook EVO escutando na porta ${PORT}`);
});
