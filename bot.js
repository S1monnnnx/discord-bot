const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;
const ORDER_CHANNEL = "1479523761467293786";
const TICKET_CATEGORY = "1479432528816509029";
const LOG_CHANNEL = "1480198632144638088";
const REVIEW_CHANNEL = "1479523999154442260";
const SELLER_ROLE_ID = "1480211256303685642";

const ticketOwners = {};
const ticketOrders = {};

function loadOrders() {
  if (!fs.existsSync("orders.json")) {
    fs.writeFileSync("orders.json", "[]");
    return [];
  }

  const content = fs.readFileSync("orders.json", "utf8").trim();
  if (!content) return [];
  return JSON.parse(content);
}

function saveOrders(orders) {
  fs.writeFileSync("orders.json", JSON.stringify(orders, null, 2));
}

client.once("ready", () => {
  console.log(`Bot online: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!panel") {
    const embed = new EmbedBuilder()
      .setTitle("🛒 Ams Shop – Köp Premium")
      .setDescription("Billiga premiumtjänster • Snabb leverans • Trygg handel")
      .setColor("#7a3cff");

    const button = new ButtonBuilder()
      .setCustomId("create_ticket")
      .setLabel("Skapa köp-ticket")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await message.channel.send({ embeds: [embed], components: [row] });
  }

  if (message.content === "!stats") {
    const orders = loadOrders();

    const embed = new EmbedBuilder()
      .setTitle("📊 Shop Statistik")
      .setColor("#7a3cff")
      .addFields({
        name: "Totala Orders",
        value: `${orders.length}`,
        inline: true
      });

    await message.channel.send({ embeds: [embed] });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    // CREATE TICKET
    if (interaction.customId === "create_ticket") {
      try {
        const guild = interaction.guild;

        const channel = await guild.channels.create({
          name: `ticket-${interaction.user.username}`.toLowerCase(),
          type: ChannelType.GuildText,
          parent: TICKET_CATEGORY,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            },
            {
              id: SELLER_ROLE_ID,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            }
          ]
        });

        ticketOwners[channel.id] = interaction.user.id;

        const saveOrderButton = new ButtonBuilder()
          .setCustomId("save_order_info")
          .setLabel("Spara orderinfo")
          .setStyle(ButtonStyle.Success);

        const closeButton = new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Stäng Ticket")
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(saveOrderButton, closeButton);

        await channel.send({
          content: `👋 Hej ${interaction.user}, skriv vad du vill köpa!`,
          components: [row]
        });

        await interaction.reply({
          content: "✅ Ticket skapad!",
          ephemeral: true
        });
      } catch (error) {
        console.log("Fel när ticket skapades:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ Något gick fel när ticketen skulle skapas.",
            ephemeral: true
          });
        }
      }
      return;
    }

    // SAVE ORDER INFO
    if (interaction.customId === "save_order_info") {
      try {
        if (!interaction.member.roles.cache.has(SELLER_ROLE_ID)) {
          await interaction.reply({
            content: "❌ Endast säljare kan spara orderinfo.",
            ephemeral: true
          });
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId("order_info_modal")
          .setTitle("Spara orderinfo");

        const productInput = new TextInputBuilder()
          .setCustomId("product")
          .setLabel("Produkt")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("t.ex. NordVPN Plus")
          .setRequired(true);

        const priceInput = new TextInputBuilder()
          .setCustomId("price")
          .setLabel("Pris")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("t.ex. 49 kr")
          .setRequired(true);

        const paymentInput = new TextInputBuilder()
          .setCustomId("payment")
          .setLabel("Betalningsmetod")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("t.ex. Swish")
          .setRequired(true);

        const periodInput = new TextInputBuilder()
          .setCustomId("period")
          .setLabel("Period")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("t.ex. 12 månader")
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(productInput),
          new ActionRowBuilder().addComponents(priceInput),
          new ActionRowBuilder().addComponents(paymentInput),
          new ActionRowBuilder().addComponents(periodInput)
        );

        await interaction.showModal(modal);
      } catch (error) {
        console.log("Fel i save_order_info:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ Något gick fel när orderinfo-rutan skulle öppnas.",
            ephemeral: true
          });
        }
      }
      return;
    }

    // CLOSE TICKET
    if (interaction.customId === "close_ticket") {
      try {
        const ownerId = ticketOwners[interaction.channel.id];

        if (!ownerId) {
          await interaction.reply({
            content: "❌ Kunde inte hitta kunden för denna ticket.",
            ephemeral: true
          });
          return;
        }

        const order = ticketOrders[interaction.channel.id];

        if (!order) {
          await interaction.reply({
            content: "❌ Ingen orderinfo är sparad ännu. Be en säljare klicka på **Spara orderinfo** först.",
            ephemeral: true
          });
          return;
        }

        const starRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("star_1").setLabel("⭐").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("star_2").setLabel("⭐⭐").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("star_3").setLabel("⭐⭐⭐").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("star_4").setLabel("⭐⭐⭐⭐").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("star_5").setLabel("⭐⭐⭐⭐⭐").setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
          content: `<@${ownerId}> ⭐ Hur var ditt köp? Välj antal stjärnor.`,
          components: [starRow]
        });
      } catch (error) {
        console.log("Fel i close_ticket:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ Något gick fel när ticketen skulle stängas.",
            ephemeral: true
          });
        }
      }
      return;
    }

    // STAR BUTTON
    if (interaction.customId.startsWith("star_")) {
      try {
        const ownerId = ticketOwners[interaction.channel.id];

        if (!ownerId) {
          await interaction.reply({
            content: "❌ Kunde inte hitta kunden för denna ticket.",
            ephemeral: true
          });
          return;
        }

        if (interaction.user.id !== ownerId) {
          await interaction.reply({
            content: "❌ Endast kunden kan lämna omdömet.",
            ephemeral: true
          });
          return;
        }

        const stars = interaction.customId.split("_")[1];

        const modal = new ModalBuilder()
          .setCustomId(`review_${stars}`)
          .setTitle("Skriv ditt omdöme");

        const reviewInput = new TextInputBuilder()
          .setCustomId("review_text")
          .setLabel("Hur gick köpet?")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Skriv din kommentar här...")
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(reviewInput)
        );

        await interaction.showModal(modal);
      } catch (error) {
        console.log("Fel i star-knappen:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ Något gick fel när omdömesrutan skulle öppnas.",
            ephemeral: true
          });
        }
      }
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    // ORDER INFO MODAL
    if (interaction.customId === "order_info_modal") {
      try {
        if (!interaction.member.roles.cache.has(SELLER_ROLE_ID)) {
          await interaction.reply({
            content: "❌ Endast säljare kan spara orderinfo.",
            ephemeral: true
          });
          return;
        }

        const ownerId = ticketOwners[interaction.channel.id];

        if (!ownerId) {
          await interaction.reply({
            content: "❌ Kunde inte hitta kunden för denna ticket.",
            ephemeral: true
          });
          return;
        }

        const product = interaction.fields.getTextInputValue("product");
        const price = interaction.fields.getTextInputValue("price");
        const payment = interaction.fields.getTextInputValue("payment");
        const period = interaction.fields.getTextInputValue("period");

        const orders = loadOrders();
        const orderNumber = orders.length + 1;

        const order = {
          id: orderNumber,
          customer: ownerId,
          product,
          price,
          payment,
          period,
          seller: interaction.user.id,
          ticketChannelId: interaction.channel.id,
          date: new Date().toISOString()
        };

        orders.push(order);
        saveOrders(orders);
        ticketOrders[interaction.channel.id] = order;

        const orderEmbed = new EmbedBuilder()
          .setTitle(`✅ Order Completed – Ams Shop #${order.id}`)
          .setColor("#7a3cff")
          .addFields(
            { name: "👤 Customer", value: `<@${order.customer}>`, inline: true },
            { name: "📦 Product", value: order.product, inline: true },
            { name: "⏳ Period", value: order.period, inline: true },
            { name: "💰 Price", value: order.price, inline: true },
            { name: "💳 Payment", value: order.payment, inline: true },
            { name: "🧑 Seller", value: `<@${order.seller}>`, inline: true }
          )
          .setTimestamp();

        const orderChannel = await client.channels.fetch(ORDER_CHANNEL);
        await orderChannel.send({ embeds: [orderEmbed] });

        await interaction.reply({
          content: `✅ Order #${order.id} sparad.`,
          ephemeral: true
        });
      } catch (error) {
        console.log("Fel när orderinfo skulle sparas:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ Något gick fel när orderinfo skulle sparas.",
            ephemeral: true
          });
        }
      }
      return;
    }

    // REVIEW MODAL
    if (interaction.customId.startsWith("review_")) {
      try {
        const ownerId = ticketOwners[interaction.channel.id];

        if (!ownerId) {
          await interaction.reply({
            content: "❌ Kunde inte hitta kunden för denna ticket.",
            ephemeral: true
          });
          return;
        }

        if (interaction.user.id !== ownerId) {
          await interaction.reply({
            content: "❌ Endast kunden kan skicka omdömet.",
            ephemeral: true
          });
          return;
        }

        const stars = Number(interaction.customId.split("_")[1]);
        const reviewText = interaction.fields.getTextInputValue("review_text");
        const order = ticketOrders[interaction.channel.id];

        if (!order) {
          await interaction.reply({
            content: "❌ Ingen orderinfo hittades för denna ticket.",
            ephemeral: true
          });
          return;
        }

        const reviewChannel = await client.channels.fetch(REVIEW_CHANNEL);

        const reviewEmbed = new EmbedBuilder()
          .setTitle("🛡 Trusted Seller – Order Completed")
          .setColor("#7a3cff")
          .setDescription(`${"⭐".repeat(stars)}\n\n"${reviewText}"`)
          .addFields(
            { name: "📦 Produkt", value: order.product, inline: true },
            { name: "💰 Pris", value: order.price, inline: true },
            { name: "💳 Betalning", value: order.payment, inline: true },
            { name: "👤 Kund", value: `<@${order.customer}>`, inline: true },
            { name: "🧑 Säljare", value: `<@${order.seller}>`, inline: true }
          )
          .setTimestamp();

        await reviewChannel.send({ embeds: [reviewEmbed] });

        const logChannel = await client.channels.fetch(LOG_CHANNEL).catch(() => null);
        if (logChannel) {
          await logChannel.send(`📜 Ticket stängd med omdöme: ${interaction.channel.name}`);
        }

        await interaction.reply({
          content: "✅ Tack för ditt omdöme! Ticket stängs nu.",
          ephemeral: true
        });

        setTimeout(async () => {
          try {
            delete ticketOwners[interaction.channel.id];
            delete ticketOrders[interaction.channel.id];
            await interaction.channel.delete();
          } catch (error) {
            console.log("Kunde inte ta bort ticket:", error.message);
          }
        }, 4000);
      } catch (error) {
        console.log("Fel när omdömet skulle skickas:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ Något gick fel när omdömet skulle skickas.",
            ephemeral: true
          });
        }
      }
      return;
    }
  }
});

client.login(TOKEN);