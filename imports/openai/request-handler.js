async ({ data: { newLink: replyLink, triggeredByLinkId }, deep, require }) => {
  let requestCounter = 0;
  const PACKAGE_NAME = `@flakeed/chatgpt`;
  const { Configuration, OpenAIApi } = require("openai");
  const openAiApiKeyTypeLinkId = await deep.id(PACKAGE_NAME, "OpenAiApiKey");
  const usesOpenAiApiKeyTypeLinkId = await deep.id(PACKAGE_NAME, "UsesOpenAiApiKey");
  const messageTypeLinkId = await deep.id('@flakeed/messaging', "Message");
  const replyTypeLinkId = await deep.id('@flakeed/messaging', "Reply");
  const authorTypeLinkId = await deep.id('@flakeed/messaging', "Author");
  const chatgptTypeLinkId = await deep.id(PACKAGE_NAME, "ChatGPT");
  const containTypeLinkId = await deep.id('@deep-foundation/core', "Contain");
  const modelTypeLinkId = await deep.id(PACKAGE_NAME, "Model");
  const usesModelTypeLinkId = await deep.id(PACKAGE_NAME, "UsesModel");
  const conversationTypeLinkId = await deep.id(PACKAGE_NAME, "Conversation");
  const messagingTree = await deep.id('@flakeed/messaging', "MessagingTree");
  let model;

  const { data: [messageLink = undefined] = [] } = await deep.select({
    id: replyLink.from_id,
    _not: {
      out: {
        to_id: chatgptTypeLinkId,
        type_id: authorTypeLinkId
      }
    }
  });
  if (!messageLink) {
    return 'No need to react to message of this reply.';
  }
  if (!messageLink.value?.value) {
    throw new Error(`##${messageLink.id} must have a value`);
  }
  const message = messageLink.value.value;

  const { data: [apiKeyLink] } = await deep.select({
    type_id: openAiApiKeyTypeLinkId,
    in: {
      type_id: usesOpenAiApiKeyTypeLinkId,
      from_id: triggeredByLinkId,
    },
  });
  if (!apiKeyLink) {
    throw new Error(`A link with type ##${openAiApiKeyTypeLinkId} is not found`);
  }
  if (!apiKeyLink.value?.value) {
    throw new Error(`##${apiKeyLink.id} must have a value`);
  }
  const apiKey = apiKeyLink.value.value;
  const configuration = new Configuration({
    apiKey: apiKey,
  });
  const openai = new OpenAIApi(configuration);

  const { data: [conversationLink] } = await deep.select({
    down: {
      tree_id: { _eq: messagingTree },
      link_id: { _eq: replyLink.id },
    },
  });

  if (!conversationLink) {
    throw new Error('A conversationLink link is not found');
  }
  const currentConversation=conversationLink.find((link) => link.type_id === conversationTypeLinkId);

  const { data: [linkedModel] } = await deep.select({
  type_id: modelTypeLinkId,
  in: {
    type_id: usesModelTypeLinkId,
    from_id: currentConversation.id, 
    },
  }); 

  const { data: [userLinkedModel] } = await deep.select({
    type_id: modelTypeLinkId,
    in: {
      type_id: usesModelTypeLinkId,
      from_id: triggeredByLinkId,
    },
  });

  if (linkedModel && linkedModel.value?.value && userLinkedModel && userLinkedModel.value?.value || linkedModel && linkedModel.value?.value) {
    model = linkedModel.value.value;
  } else {
    if (!userLinkedModel) {
      throw new Error(`A link with type ##${userLinkedModel} is not found`);
    }
    if (!userLinkedModel.value?.value) {
      throw new Error(`##${userLinkedModel.id} must have a value`);
    } else {
      model = userLinkedModel.value.value;
    }
  }
  if (!model) {
    throw new Error(`A valid model value was not found in either linkedModel or userLinkedModel`);
  }
  let response;

  if (requestCounter >= 1) {
    const { data: messages } = await deep.select({
      down: {
        tree_id: {
          _id: ["@flakeed/messaging", "MessagingTree"],
        },
        parent: {
          type_id: {
            _id: ["@deep-foundation/core", "TreeIncludeNode"],
          },
          to: {
            type_id: {
              _id: replyLink.from_id ,
            },
          },
        },
        parent_id:replyLink.to_id[0]
      },
    });

    const messagesForModel = messages.map(message => {
      const role = message.in.find(link => link.type_id === authorTypeLinkId).from_id === chatgptTypeLinkId
      ? "assistant"
      : "user";
      return { role, content: message.value.value };
      });

      const response = await openai.createChatCompletion({
        model: model,
        messages: messagesForModel.concat({ role: "user", content: message }),
        });
  }

  if (requestCounter < 1) {
  response = await openai.createChatCompletion({
    model: model,
    messages: [{
      role: "user", content: message
    }],
  });
}

  const { data: [{ id: chatgptMessageLinkId }] } = await deep.insert({
  type_id: messageTypeLinkId,
  string: { data: { value: response.data.choices[0].message.content } },
  in:{
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
        to_id: chatgptTypeLinkId,
      },
    ],
  },
});

  const { data: [{ id: replyToMessageLinkId }] } = await deep.insert({
    type_id: replyTypeLinkId,
    from_id: chatgptMessageLinkId,
    to_id: replyLink.from_id,
    in: {
      data: {
        type_id: containTypeLinkId,
        from_id: triggeredByLinkId,
      },
    },
  });
  requestCounter++;

  return response.data;
};