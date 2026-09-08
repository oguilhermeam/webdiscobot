require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder 
} = require('discord.js');

// ============================================================
// Configuração das Variáveis de Ambiente
// ============================================================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
// URL base da sua aplicação VozCanal no Vercel (ou localhost para testes)
const VOZCANAL_BASE_URL = (process.env.VOZCANAL_URL || 'https://vozcanal.vercel.app').replace(/\/$/, '');

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ ERRO: DISCORD_TOKEN ou DISCORD_CLIENT_ID não configurados no arquivo .env!');
  console.log('Crie um arquivo .env dentro desta pasta com:');
  console.log('DISCORD_TOKEN=seu_token_aqui');
  console.log('DISCORD_CLIENT_ID=seu_client_id_aqui');
  console.log('VOZCANAL_URL=https://sua-url.vercel.app');
  process.exit(1);
}

// ============================================================
// Definição dos Slash Commands
// ============================================================
const commands = [
  new SlashCommandBuilder()
    .setName('live')
    .setDescription('Inicia uma transmissão ultra-smooth no VozCanal')
    .addStringOption(option =>
      option.setName('sala')
        .setDescription('Nome da sala personalizada (ex: gamedev, valorant, cs2)')
        .setRequired(false)
    )
].map(cmd => cmd.toJSON());

// Registro global de comandos Slash na API do Discord
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerSlashCommands() {
  try {
    console.log('🔄 Registrando comandos Slash instantâneos nos servidores...');
    // Registra instantaneamente em todos os servidores onde o bot está presente (zero delay)
    const guilds = client.guilds.cache;
    for (const [guildId, guild] of guilds) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
      console.log(`✅ Comandos registrados no servidor: ${guild.name}`);
    }
    // E também registra globalmente
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Comandos registrados globalmente!');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }
}

// ============================================================
// Inicialização do Bot
// ============================================================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('clientReady', () => {
  console.log(`🚀 Bot online logado como: ${client.user.tag}`);
  registerSlashCommands();
});

// ============================================================
// Manipulação do comando /live
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'live') {
    // 1. Define o nome da sala (usa o digitado ou gera um amigável com o nick do usuário)
    const customRoom = interaction.options.getString('sala');
    const safeNick = interaction.user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'stream';
    const roomName = customRoom 
      ? customRoom.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32)
      : `${safeNick}-live`;

    // 2. Tenta obter ou criar um Webhook no canal onde o comando foi digitado
    let webhookUrl = null;
    try {
      if (interaction.channel && interaction.channel.fetchWebhooks) {
        const hooks = await interaction.channel.fetchWebhooks();
        let existingHook = hooks.find(h => h.owner && h.owner.id === client.user.id);
        if (!existingHook) {
          existingHook = await interaction.channel.createWebhook({
            name: 'VozCanal Live',
            avatar: 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f534.png'
          });
        }
        webhookUrl = existingHook.url;
      }
    } catch (e) {
      console.warn('Não foi possível criar/recuperar webhook automático (sem permissão no canal?):', e.message);
    }

    // 3. Monta a URL de transmissão privada para quem chamou o /live
    // Parâmetros:
    // - sala: nome do canal
    // - stream=auto: abre diretamente o modal de escolha de FPS e tela
    // - hook: webhook codificado em base64 (só é disparado quando o stream iniciar de fato)
    let streamUrl = `${VOZCANAL_BASE_URL}/?sala=${encodeURIComponent(roomName)}&stream=auto`;
    if (webhookUrl) {
      const hookBase64 = Buffer.from(webhookUrl).toString('base64');
      streamUrl += `&hook=${encodeURIComponent(hookBase64)}`;
    }

    // 4. Cria o botão interativo para o host abrir a live
    const hostRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('▶️ Iniciar Transmissão na Web')
        .setStyle(ButtonStyle.Link)
        .setURL(streamUrl)
    );

    const embed = new EmbedBuilder()
      .setTitle('🎮 Transmissão VozCanal')
      .setDescription(
        `Olá <@${interaction.user.id}>! Sua sala **#${roomName}** está pronta.\n\n` +
        `**Instruções:**\n` +
        `1. Clique no botão abaixo para abrir a sala.\n` +
        `2. Selecione a resolução (1080p/720p) e FPS (60 FPS).\n` +
        `3. Assim que você compartilhar a tela, um convite com botão de 1 clique será enviado automaticamente neste chat para seus amigos assistirem!\n\n` +
        `*(Se fechar ou não transmitir, nada será enviado no canal)*`
      )
      .setColor(0x8f7ebb)
      .setFooter({ text: 'VozCanal • Ultra-Smooth 60 FPS' });

    // Envia a resposta como EFÊMERA (visível APENAS para você, mantendo privacidade se desistir)
    await interaction.reply({
      embeds: [embed],
      components: [hostRow],
      ephemeral: true
    });
  }
});

client.login(TOKEN);
