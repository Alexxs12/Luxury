// Requiere módulos
const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  EmbedBuilder, PermissionsBitField
} = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
process.env.FFMPEG_PATH = require('ffmpeg-static');

// Crear cliente
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ]
});

// Archivos de datos
const warningsFile = path.join(__dirname, 'warnings.json');
const partidosFile = path.join(__dirname, 'partidos.json');
const equiposFile = path.join(__dirname, 'equipos.json');

// Cargar datos
let warns = fs.existsSync(warningsFile) ? JSON.parse(fs.readFileSync(warningsFile)) : {};
let partidos = fs.existsSync(partidosFile) ? JSON.parse(fs.readFileSync(partidosFile)) : [];
let equipos = fs.existsSync(equiposFile) ? JSON.parse(fs.readFileSync(equiposFile)) : {};

// DisTube setup
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { YtDlpPlugin } = require('@distube/yt-dlp');

client.distube = new DisTube(client, {
  emitNewSongOnly: true,
  plugins: [new SpotifyPlugin(), new SoundCloudPlugin(), new YtDlpPlugin()]
});

// Eventos de música
client.distube
  .on('error', (channel, error) => {
    console.error('DisTube error:', error);
    if (channel?.send) channel.send(`❌ Error: \`${error.message}\``);
  })
  .on('ffmpegError', (queue, error) => {
    console.error('FFmpeg error:', error);
    if (queue?.textChannel) queue.textChannel.send(`⚠️ FFmpeg error: ${error.message}`);
  })
  .on('finish', queue => console.log("✅ Canción finalizada."))
  .on('disconnect', queue => console.log("🔌 Desconectado del canal de voz."))
  .on('empty', queue => console.log("👻 Canal vacío, saliendo."));

// Botones musicales
const { setupMusic, musicButtons } = require('./music.js');
setupMusic(client);

// Variables de entorno
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

// Slash Commands
const commands = [
  new SlashCommandBuilder().setName('warn')
    .setDescription('Advertir a un usuario')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption(opt => opt.setName('razon').setDescription('Razón').setRequired(true)),

  new SlashCommandBuilder().setName('ver-warns')
    .setDescription('Ver advertencias')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true)),

  new SlashCommandBuilder().setName('vbuild')
    .setDescription('Crea una build de vóley')
    .addStringOption(opt => opt.setName('usuario').setDescription('Jugador').setRequired(true))
    .addStringOption(opt => opt.setName('posicion').setDescription('Posición').setRequired(true))
    .addStringOption(opt => opt.setName('slot1').setDescription('Primer slot').setRequired(true))
    .addStringOption(opt => opt.setName('slot2').setDescription('Segundo slot').setRequired(true))
    .addStringOption(opt => opt.setName('altura').setDescription('Altura').setRequired(true)),

  new SlashCommandBuilder().setName('vhelp').setDescription('Muestra comandos del bot'),

  new SlashCommandBuilder().setName('registrar-partido')
    .setDescription('Registrar partido')
    .addStringOption(opt => opt.setName('equipo1').setDescription('Equipo 1').setRequired(true))
    .addStringOption(opt => opt.setName('equipo2').setDescription('Equipo 2').setRequired(true))
    .addIntegerOption(opt => opt.setName('puntos_equipo1').setDescription('Puntos equipo 1').setRequired(true))
    .addIntegerOption(opt => opt.setName('puntos_equipo2').setDescription('Puntos equipo 2').setRequired(true)),

  new SlashCommandBuilder().setName('ver-historial').setDescription('Ver historial de partidos'),

  new SlashCommandBuilder().setName('ver-equipo')
    .setDescription('Ver estadísticas de un equipo')
    .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del equipo').setRequired(true)),

  new SlashCommandBuilder().setName('play')
    .setDescription('Reproducir música')
    .addStringOption(opt => opt.setName('query').setDescription('Nombre o URL').setRequired(true)),
].map(cmd => cmd.toJSON());

// Registrar comandos
const rest = new REST({ version: '10' }).setToken(token);
client.once('ready', async () => {
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`✅ Bot iniciado como ${client.user.tag}`);
  } catch (error) {
    console.error('❌ Error registrando comandos:', error);
  }
});

// Interacciones
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) return musicButtons(interaction, client);
  if (!interaction.isChatInputCommand()) return;

  try {
    const cmd = interaction.commandName;

    // Manejo de comandos
    const commandsMap = {
      'warn': async () => {
        const user = interaction.options.getUser('usuario');
        const reason = interaction.options.getString('razon');
        warns[user.id] = warns[user.id] || [];
        warns[user.id].push({ reason, moderator: interaction.user.id, timestamp: new Date().toISOString() });
        fs.writeFileSync(warningsFile, JSON.stringify(warns, null, 2));
        return interaction.reply(`⚠️ Advertencia a <@${user.id}>: **${reason}**`);
      },

      'ver-warns': async () => {
        const user = interaction.options.getUser('usuario');
        const lista = warns[user.id];
        if (!lista?.length) return interaction.reply(`✅ <@${user.id}> no tiene advertencias.`);

        const embed = new EmbedBuilder()
          .setTitle(`⚠️ Advertencias de ${user.username}`)
          .setColor('#FFA500')
          .setThumbnail(user.displayAvatarURL())
          .setFooter({ text: `Total: ${lista.length}` })
          .setTimestamp();

        lista.forEach((w, i) => {
          embed.addFields({
            name: `Advertencia ${i + 1}`,
            value: `📝 **Razón:** ${w.reason}\n👮‍♂️ <@${w.moderator}>\n🕒 <t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:f>`
          });
        });

        return interaction.reply({ embeds: [embed] });
      },

      'vbuild': async () => {
        const opt = interaction.options;
        const embed = new EmbedBuilder()
          .setTitle('🏐 BUILD DE VOLLEYBALL')
          .setColor('#FF6B35')
          .setThumbnail('https://cdn-icons-png.flaticon.com/512/857/857418.png')
          .addFields(
            { name: '👤 Usuario', value: opt.getString('usuario'), inline: true },
            { name: '🎯 Posición', value: opt.getString('posicion'), inline: true },
            { name: '📏 Altura', value: opt.getString('altura'), inline: true },
            { name: '⚡ Slot 1', value: opt.getString('slot1') },
            { name: '🔥 Slot 2', value: opt.getString('slot2') }
          )
          .setFooter({ text: `Build de ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
          .setTimestamp();
        return interaction.reply({ embeds: [embed] });
      },

      'vhelp': async () => {
        const embed = new EmbedBuilder()
          .setTitle('📚 COMANDOS DISPONIBLES')
          .setColor('#4CAF50')
          .addFields(
            { name: '/warn', value: 'Advertir a un usuario.' },
            { name: '/ver-warns', value: 'Ver advertencias.' },
            { name: '/vbuild', value: 'Crear una build de vóley.' },
            { name: '/registrar-partido', value: 'Registrar un partido.' },
            { name: '/ver-historial', value: 'Ver historial de partidos.' },
            { name: '/ver-equipo', value: 'Ver estadísticas de un equipo.' },
            { name: '/play', value: 'Reproducir música.' }
          )
          .setFooter({ text: 'Volleyball Bot v3.0' })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      },

      'registrar-partido': async () => {
        const opt = interaction.options;
        const eq1 = opt.getString('equipo1');
        const eq2 = opt.getString('equipo2');
        const pts1 = opt.getInteger('puntos_equipo1');
        const pts2 = opt.getInteger('puntos_equipo2');

        partidos.push({ equipo1: eq1, equipo2: eq2, puntos1: pts1, puntos2: pts2, timestamp: new Date().toISOString() });

        [eq1, eq2].forEach(eq => {
          equipos[eq] = equipos[eq] || { puntos: 0, ganados: 0, jugados: 0 };
          equipos[eq].jugados++;
        });

        if (pts1 > pts2) equipos[eq1].ganados++;
        else if (pts2 > pts1) equipos[eq2].ganados++;

        fs.writeFileSync(partidosFile, JSON.stringify(partidos, null, 2));
        fs.writeFileSync(equiposFile, JSON.stringify(equipos, null, 2));

        const ganador = pts1 === pts2 ? 'Empate 🤝' : (pts1 > pts2 ? `🏆 ${eq1}` : `🏆 ${eq2}`);

        const embed = new EmbedBuilder()
          .setTitle('📥 Partido Registrado')
          .setColor(pts1 > pts2 ? '#4CAF50' : pts2 > pts1 ? '#F44336' : '#FFC107')
          .addFields(
            { name: '🟦 Equipo 1', value: `${eq1} — **${pts1} pts**`, inline: true },
            { name: '🟥 Equipo 2', value: `${eq2} — **${pts2} pts**`, inline: true },
            { name: '🥇 Resultado', value: ganador }
          )
          .setFooter({ text: 'Sistema de Partidos | Volleyball Bot' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      },

      'ver-historial': async () => {
        if (!partidos.length) return interaction.reply('📭 No hay partidos registrados.');
        const embed = new EmbedBuilder()
          .setTitle('📅 Historial de Partidos')
          .setColor('#2196F3')
          .setFooter({ text: 'Últimos 10 partidos' })
          .setTimestamp();

        partidos.slice(-10).reverse().forEach((p, i) => {
          const ganador = p.puntos1 > p.puntos2 ? p.equipo1 : p.puntos1 < p.puntos2 ? p.equipo2 : 'Empate 🤝';
          embed.addFields({
            name: `#${i + 1} 🆚 ${p.equipo1} vs ${p.equipo2}`,
            value: `🏆 **Ganador:** ${ganador}\n🟦 ${p.equipo1}: ${p.puntos1} pts\n🟥 ${p.equipo2}: ${p.puntos2} pts\n🕒 <t:${Math.floor(new Date(p.timestamp).getTime() / 1000)}:R>`
          });
        });

        return interaction.reply({ embeds: [embed] });
      },

      'ver-equipo': async () => {
        const nombre = interaction.options.getString('nombre');
        const data = equipos[nombre];
        if (!data) return interaction.reply(`❌ No se encontraron datos para **${nombre}**.`);
        const winrate = (data.ganados / data.jugados * 100).toFixed(1) || '0.0';
        const last = partidos.filter(p => [p.equipo1, p.equipo2].includes(nombre)).pop();
        const fecha = last ? `<t:${Math.floor(new Date(last.timestamp).getTime() / 1000)}:f>` : 'N/A';

        const embed = new EmbedBuilder()
          .setTitle(`📊 Estadísticas de ${nombre}`)
          .setColor('#FFD700')
          .addFields(
            { name: '🏆 Jugados', value: `${data.jugados}`, inline: true },
            { name: '✅ Ganados', value: `${data.ganados}`, inline: true },
            { name: '📈 Winrate', value: `${winrate}%`, inline: true },
            { name: '🕒 Último partido', value: fecha }
          )
          .setFooter({ text: 'Sistema de Estadísticas | Volleyball Bot' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      },

      'play': async () => {
        const query = interaction.options.getString('query');
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) return interaction.reply({ content: '❌ Debes estar en un canal de voz.', ephemeral: true });

        const perms = voiceChannel.permissionsFor(interaction.client.user);
        if (!perms.has(PermissionsBitField.Flags.Connect) || !perms.has(PermissionsBitField.Flags.Speak)) {
          return interaction.reply({ content: '❌ No tengo permisos para unirme y hablar.', ephemeral: true });
        }

        await interaction.reply(`🎶 Buscando **${query}**...`);
        await client.distube.play(voiceChannel, query, {
          textChannel: interaction.channel,
          member: interaction.member,
        });
      }
    };

    // Ejecutar el comando correspondiente
    if (commandsMap[cmd]) await commandsMap[cmd]();
    else return interaction.reply({ content: '❌ Comando no reconocido.', ephemeral: true });

  } catch (err) {
    console.error('❌ Error en interacción:', err);
    return interaction.reply({ content: '❌ Hubo un error ejecutando el comando.', ephemeral: true });
  }
});

client.login(token);