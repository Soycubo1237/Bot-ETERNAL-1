require('dotenv').config();
const { Client, GatewayIntentBits, Partials, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel],
});

const TICKET_CATEGORY_NAME = "Tickets";
const TICKET_CHANNEL_PREFIX = "ticket-";
const STAFF_ROLE_NAME = "Staff";

client.once(Events.ClientReady, async () => {
    console.log(`Bot conectado como ${client.user.tag}`);

    // Registrar comando slash globalmente
    const data = {
        name: 'ticket',
        description: 'Abre un ticket de soporte',
    };

    const guilds = client.guilds.cache.map(guild => guild.id);
    try {
        for (const guildId of guilds) {
            const guild = await client.guilds.fetch(guildId);
            await guild.commands.create(data);
            console.log(`Comando /ticket registrado en guild ${guild.name}`);
        }
    } catch (error) {
        console.error('Error registrando comandos:', error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'ticket') {
            const guild = interaction.guild;
            const member = interaction.member;

            // Buscar o crear categoría
            let category = guild.channels.cache.find(c => c.name === TICKET_CATEGORY_NAME && c.type === 4); // 4 = GUILD_CATEGORY
            if (!category) {
                category = await guild.channels.create({
                    name: TICKET_CATEGORY_NAME,
                    type: 4,
                });
            }

            // Verificar si ya tiene ticket abierto
            const existingChannel = guild.channels.cache.find(c => c.name === `${TICKET_CHANNEL_PREFIX}${member.user.username.toLowerCase()}`);
            if (existingChannel) {
                await interaction.reply({ content: `Ya tienes un ticket abierto: ${existingChannel}`, ephemeral: true });
                return;
            }

            // Permisos para el canal
            const permissions = [
                {
                    id: guild.roles.everyone,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: member.user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                },
            ];

            // Añadir permisos para rol Staff si existe
            const staffRole = guild.roles.cache.find(r => r.name === STAFF_ROLE_NAME);
            if (staffRole) {
                permissions.push({
                    id: staffRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                });
            }

            // Crear canal
            const channel = await guild.channels.create({
                name: `${TICKET_CHANNEL_PREFIX}${member.user.username.toLowerCase()}`,
                type: 0, // GUILD_TEXT
                parent: category.id,
                permissionOverwrites: permissions,
                topic: `Ticket de soporte de ${member.user.tag} (ID: ${member.user.id})`,
            });

            // Crear botón para cerrar ticket
            const closeButton = new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Cerrar ticket')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(closeButton);

            await channel.send({ content: `Hola ${member}, gracias por abrir un ticket. Un miembro del staff te atenderá pronto.`, components: [row] });
            await interaction.reply({ content: `Tu ticket ha sido creado: ${channel}`, ephemeral: true });
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'close_ticket') {
            const channel = interaction.channel;
            const member = interaction.member;
            const guild = interaction.guild;

            if (!channel.name.startsWith(TICKET_CHANNEL_PREFIX)) {
                await interaction.reply({ content: 'Este comando solo funciona dentro de un canal de ticket.', ephemeral: true });
                return;
            }

            // Obtener ID del creador del ticket del topic
            let userId = null;
            if (channel.topic) {
                const match = channel.topic.match(/\$ID: (\d+)\$/);
                if (match) userId = match[1];
            }

            // Verificar si el usuario es staff o creador del ticket
            const staffRole = guild.roles.cache.find(r => r.name === STAFF_ROLE_NAME);
            const isStaff = staffRole ? member.roles.cache.has(staffRole.id) : false;

            if (member.id !== userId && !isStaff) {
                await interaction.reply({ content: 'Solo el creador del ticket o el staff pueden cerrarlo.', ephemeral: true });
                return;
            }

            await interaction.reply({ content: 'Cerrando ticket en 5 segundos...' });

            setTimeout(async () => {
                try {
                    await channel.delete(`Ticket cerrado por ${member.user.tag}`);
                } catch (error) {
                    console.error('Error al eliminar canal:', error);
                }
            }, 5000);
        }
    }
});

client.login(TOKEN);