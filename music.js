// 🛠️ Cargar ffmpeg-static correctamente
const ffmpegPath = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegPath;

// 📦 Imports de Discord y DisTube
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { YtDlpPlugin } = require('@distube/yt-dlp');

function setupMusic(client) {
  client.distube = new DisTube(client, {
    emitNewSongOnly: true,
    plugins: [new SpotifyPlugin(), new SoundCloudPlugin(), new YtDlpPlugin()]
  });

  client.distube.on('playSong', (queue, song) => {
    const embed = new EmbedBuilder()
      .setTitle('🎵 Reproduciendo ahora')
      .setDescription(`[${song.name}](${song.url})`)
      .setThumbnail(song.thumbnail)
      .addFields(
        { name: '⏱️ Duración', value: song.formattedDuration || 'Desconocida', inline: true },
        { name: '🎤 Autor', value: song.uploader?.name || 'Desconocido', inline: true }
      )
      .setColor('#1DB954')
      .setFooter({ text: `Solicitado por ${song.user?.username || 'Anónimo'}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pause')
        .setLabel('⏸️ Pausar')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('resume')
        .setLabel('▶️ Reanudar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('skip')
        .setLabel('⏭️ Saltar')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('stop')
        .setLabel('⏹️ Parar')
        .setStyle(ButtonStyle.Danger)
    );

    queue.textChannel.send({ embeds: [embed], components: [row] }).catch(console.error);
  });
}

async function musicButtons(interaction, client) {
  if (!interaction.isButton()) return;

  const queue = client.distube.getQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({
      content: '❌ No hay música reproduciéndose.',
      ephemeral: true
    });
  }

  try {
    switch (interaction.customId) {
      case 'pause':
        queue.pause();
        await interaction.reply({ content: '⏸️ Música pausada.', ephemeral: true });
        break;
      case 'resume':
        queue.resume();
        await interaction.reply({ content: '▶️ Música reanudada.', ephemeral: true });
        break;
      case 'skip':
        await queue.skip();
        await interaction.reply({ content: '⏭️ Canción saltada.', ephemeral: true });
        break;
      case 'stop':
        queue.stop();
        await interaction.reply({ content: '⏹️ Música detenida.', ephemeral: true });
        break;
    }
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: '⚠️ Ocurrió un error al procesar el botón.',
      ephemeral: true
    });
  }
}

module.exports = {
  setupMusic,
  musicButtons
};