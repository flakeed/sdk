async ({ data: { newLink: replyLink, triggeredByLinkId }, deep, require }) => {
  const startTime = Date.now();
  const PACKAGE_NAME = `@deep-foundation/chatgpt`;
  const { Configuration, OpenAIApi } = require('openai');
  const chatGPTTypeLinkId = await deep.id(PACKAGE_NAME, 'ChatGPT');
  const conversationTypeLinkId = await deep.id(PACKAGE_NAME, 'Conversation');
  const apiKeyTypeLinkId = await deep.id('@deep-foundation/openai', 'ApiKey');
  const usesApiKeyTypeLinkId = await deep.id('@deep-foundation/openai', 'UsesApiKey');
  const modelTypeLinkId = await deep.id('@deep-foundation/openai', 'Model');
  const usesModelTypeLinkId = await deep.id('@deep-foundation/openai', 'UsesModel');
  const messageTypeLinkId = await deep.id('@deep-foundation/messaging', 'Message');
  const replyTypeLinkId = await deep.id('@deep-foundation/messaging', 'Reply');
  const authorTypeLinkId = await deep.id('@deep-foundation/messaging', 'Author');
  const containTypeLinkId = await deep.id('@deep-foundation/core', 'Contain');
  const messagingTreeId = await deep.id('@deep-foundation/messaging', 'MessagingTree');
  const systemTypeLinkId = await deep.id('@deep-foundation/chatgpt', 'System');
  const tokensTypeLinkId = await deep.id("@deep-foundation/tokens", "Tokens")
  const reservedIds = await deep.reserve(1);
  const chatGPTMessageLinkId = reservedIds.pop();
  let systemMessageId;
  let model;
  let MAX_TOKENS;
  let systemMessage;

  const { data: [messageLink] } = await deep.select({
    id: replyLink.from_id,
    _not: {
      out: {
        to_id: chatGPTTypeLinkId,
        type_id: authorTypeLinkId,
      },
    },
  });
  if (!messageLink) {
    return 'No need to react to message of this reply.';
  }
  if (!messageLink.value?.value) {
    throw new Error(`Message ##${messageLink.id} must have a value`);
  }
  const message = messageLink.value.value;

  const apiKeyLink = await getTokenLink();
  const apiKey = apiKeyLink.value.value;
  const configuration = new Configuration({
    apiKey: apiKey,
  });
  const openai = new OpenAIApi(configuration);

  const { data: conversationLink } = await deep.select({
    tree_id: { _eq: messagingTreeId },
    parent: { type_id: { _in: [conversationTypeLinkId, messageTypeLinkId] } },
    link: { id: { _eq: replyLink.from_id } },
  }, {
    table: 'tree',
    variables: { order_by: { depth: "asc" } },
    returning: `
    id
    depth
    root_id
    parent_id
    link_id
    parent {
      id
      from_id
      type_id
      to_id
      value
      author: out (where: { type_id: { _eq: ${authorTypeLinkId}} }) { 
        id
        from_id
        type_id
        to_id
      }
      tokens: out (where: { type_id: { _eq: ${tokensTypeLinkId}} }) { 
      id
      from_id
      type_id
      to_id
      value
      }
    }`
  })
  console.log("conversationLink", conversationLink);
  if (!conversationLink) {
    throw new Error('A conversationLink link is not found');
  }
  const currentConversation = conversationLink.find(
    (link) => link.parent.type_id === conversationTypeLinkId
  );

  conversationLink.forEach((link) => {
    if (link.parent.author && link.parent.author.length > 0) {
      link.parent.author = link.parent.author[0];
    }
  });

  const {
    data: [linkedModel],
  } = await deep.select({
    type_id: modelTypeLinkId,
    in: {
      type_id: usesModelTypeLinkId,
      from_id: currentConversation.parent.id,
    },
  });

  const {
    data: [userLinkedModel],
  } = await deep.select({
    type_id: modelTypeLinkId,
    in: {
      type_id: usesModelTypeLinkId,
      from_id: triggeredByLinkId,
    },
  });

  if (!linkedModel && !userLinkedModel) {
    model = 'gpt-3.5-turbo';
  } else if (
    (linkedModel &&
      linkedModel.value?.value &&
      userLinkedModel &&
      userLinkedModel.value?.value) ||
    (linkedModel && linkedModel.value?.value)
  ) {
    model = linkedModel.value.value;
  } else {
    if (!userLinkedModel) {
      throw new Error(`A link with type ##${userLinkedModel} is not found`);
    }
    if (!userLinkedModel.value?.value) {
      throw new Error(`Linked model with user ##${userLinkedModel.id} must have a value`);
    } else {
      model = userLinkedModel.value.value;
    }
  }
  const messageLinks = conversationLink
    .map(item => item.parent)
    .filter(link => link && link.type_id === messageTypeLinkId);
  let allMessages = await getMessages({ messageLinks });
  const messagesToSend = [...allMessages];

  const { data: userLinkedSystemMessageLinks } = await deep.select({
    type_id: systemTypeLinkId,
    to_id: triggeredByLinkId,
  }, { returning: `id message: from{ id value} conversation:to{id}` });
  console.log("userLinkedSystemMessageLinks", userLinkedSystemMessageLinks)
  // Fetching system messages linked to the conversation
  const { data: conversationLinkedSystemMessageLink } = await deep.select({
    type_id: systemTypeLinkId,
    to_id: currentConversation.parent.id,
  }, { returning: `id message: from{ id value} conversation:to{id}` });
  console.log("conversationLinkedSystemMessageLink", conversationLinkedSystemMessageLink)

  if (conversationLinkedSystemMessageLink && conversationLinkedSystemMessageLink.length > 0) {
    const systemMessageLink = conversationLinkedSystemMessageLink[0];
    if (!systemMessageLink.message?.value?.value) {
      throw new Error(`System message with link to conversation ##${systemMessageLink.id} must have a value`);
    } else {
      systemMessage = systemMessageLink.message.value.value;
      systemMessageId = systemMessageLink.message;
    }
  } else if (userLinkedSystemMessageLinks && userLinkedSystemMessageLinks.length > 0) {
    if (userLinkedSystemMessageLinks.length > 1) {
      throw new Error("Multiple system messages linked to the user are found");
    }

    const userLinkedSystemMessageLink = userLinkedSystemMessageLinks[0];

    if (!userLinkedSystemMessageLink.message?.value?.value) {
      throw new Error(`System message with link to user ##${userLinkedSystemMessageLink.id} must have a value`);
    } else {
      systemMessage = userLinkedSystemMessageLink.message.value.value;
      systemMessageId = userLinkedSystemMessageLink.message;
    }
  }

  if (systemMessage) {
    const { data: tokensLinkedToSystemMessage } = await deep.select({
      type_id: tokensTypeLinkId,
      from_id: systemMessageId.id,
      to_id: systemMessageId.id,
    });
    console.log("tokensLinkedToSystemMessage", tokensLinkedToSystemMessage)
    let tokenCount = tokensLinkedToSystemMessage[0].value?.value;
    console.log("tokenCount", tokenCount)
    messagesToSend.unshift({
      role: "system",
      content: systemMessage,
      tokens: tokenCount,
    });

    console.log("system message ", systemMessage);
  }
  if (model === 'gpt-3.5-turbo') {
    MAX_TOKENS = 4096;
  } else if (model === 'gpt-4') {
    MAX_TOKENS = 8192;
  } else {
    throw new Error(`Unsupported model: ${model}`);
  }
  const tokenLimit = MAX_TOKENS * 7 / 8;
  let totalTokens = 0;
  let messagesToSendToOpenAI = [];

  for (let i = messagesToSend.length - 1; i >= 0; i--) {
    const message = messagesToSend[i];

    if (message.role === 'system' || totalTokens + message.tokens <= MAX_TOKENS) {
      messagesToSendToOpenAI.unshift({ role: message.role, content: message.content });
      totalTokens += message.tokens;
    } else {
      break;
    }
  }

  console.log("messagesToSendToOpenAI", messagesToSendToOpenAI)
  console.log("total Tokens", totalTokens)

  console.log("after slice messages", messagesToSend)
  const response = await openai.createChatCompletion({
    model: model,
    messages: [
      ...messagesToSendToOpenAI
    ],
  });

  await deep.serial({
    operations: [
      {
        table: 'links',
        type: 'insert',
        objects: {
          id: chatGPTMessageLinkId,
          type_id: messageTypeLinkId,
          in: {
            data: [
              {
                type_id: containTypeLinkId,
                from_id: triggeredByLinkId,
              },
            ],
          },
          out: {
            data: [
              {
                type_id: authorTypeLinkId,
                to_id: chatGPTTypeLinkId,
              },
            ],
          },
        },
      },
      {
        table: 'strings',
        type: 'insert',
        objects: {
          link_id: chatGPTMessageLinkId,
          value: response.data.choices[0].message.content
        }
      },
      {
        table: 'links',
        type: 'insert',
        objects: {
          type_id: replyTypeLinkId,
          from_id: chatGPTMessageLinkId,
          to_id: replyLink.from_id,
          in: {
            data: {
              type_id: containTypeLinkId,
              from_id: triggeredByLinkId,
            },
          },
        },
      },
    ],
  });

  async function getMessages({ messageLinks }) {
    return Promise.all(
      messageLinks.map(async (link) => {
        const tokens = link.tokens?.length > 0 ? link.tokens[0].value.value : undefined;
        return {
          role: await getMessageRole({ messageLink: link }),
          content: link.value.value,
          tokens: tokens,
        }
      })
    );
  }

  async function getMessageRole({ messageLink }) {
    const authorLink = messageLink.author;
    if (!authorLink) {
      throw new Error(`Author link not found for message ##${messageLink.id}`);
    }
    return authorLink.to_id === chatGPTTypeLinkId ? 'assistant' : 'user';
  }

  async function getTokenLink() {
    let resultTokenLink;
    const { data } = await deep.select({
      _or: [
        {
          type_id: apiKeyTypeLinkId,
          in: {
            type_id: containTypeLinkId,
            from_id: triggeredByLinkId,
          },
        },
        {
          from_id: triggeredByLinkId,
          type_id: usesApiKeyTypeLinkId,
        },
      ],
    });
    if (data.length === 0) {
      throw new Error(`ApiKey ##${apiKeyTypeLinkId} is not found`);
    }
    const usesLinks = data.filter(
      (link) => link.type_id === usesApiKeyTypeLinkId
    );
    if (usesLinks.length > 1) {
      throw new Error(
        `More than 1 links of type ##${usesApiKeyTypeLinkId} are found`
      );
    }
    const usesLink = data.find(
      (link) => link.type_id === usesApiKeyTypeLinkId
    );
    if (usesLink) {
      const tokenLink = data.find((link) => link.id === usesLink.to_id);
      if (!tokenLink) {
        throw new Error(`ApiKey ##${apiKeyTypeLinkId} is not found`);
      } else {
        resultTokenLink = tokenLink;
      }
    } else {
      const tokenLink = data.filter(
        (link) => link.type_id === apiKeyTypeLinkId
      );
      if (tokenLink.length > 1) {
        throw new Error(
          `For 2 or more ApiKey ##${apiKeyTypeLinkId} links you must activate it with usesOpenAiApiKey link`
        );
      } else {
        const tokenLink = data.find(
          (link) => link.type_id === apiKeyTypeLinkId
        );
        if (!tokenLink) {
          throw new Error(`ApiKey ##${apiKeyTypeLinkId} is not found`);
        }
        resultTokenLink = tokenLink;
      }
    }
    if (!resultTokenLink.value?.value) {
      throw new Error(`ApiKey ##${apiKeyTypeLinkId} has no value`);
    }
    return resultTokenLink;
  }
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  return {
    request: {
      model: model,
      messages: [
        ...messagesToSendToOpenAI
      ],
    },
    response: response.data,
    duration: duration,
    totalTokens: totalTokens
  };
};
