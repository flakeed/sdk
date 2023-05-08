async ({ data: { newLink: replyLink, triggeredByLinkId }, deep, require }) => {
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
  const reservedIds = await deep.reserve(1);
  const chatGPTMessageLinkId = reservedIds.pop();
  let model;
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
  const allMessages = await getMessages({ messageLinks });
  const messagesToSend = [...allMessages];

const { data: systemMessageLinks } = await deep.select({
    type_id: systemTypeLinkId,
    to_id: currentConversation.parent.id,
  }, {returning: `id message: from{ id value} conversation:to{id}`});

  if(systemMessageLinks?.[0]?.message?.value?.value){
    if (systemMessageLinks.length > 1) {
      throw new Error("A systemMessageLink link is exist in the current conversation");
    }
     systemMessage = systemMessageLinks[0].message.value.value;
  console.log("messagesToSend before unshift: ", messagesToSend);
  messagesToSend.unshift({
    role: "system",
    content: systemMessage,
  });
  console.log("messagesToSend after unshift: ", messagesToSend);
  console.log("system message ", systemMessage);
}

  console.log("messagesToSend", messagesToSend)

  const response = await openai.createChatCompletion({
    model: model,
    messages: [
      ...messagesToSend,
      {
        role: 'user',
        content: message,
      },
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
      messageLinks.map(async (link) => ({
        role: await getMessageRole({ messageLink: link }),
        content: link.value.value,
      }))
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

  return response.data;
};
