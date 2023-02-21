import { DeepClient } from "@deep-foundation/deeplinks/imports/client";
import * as fs from "fs";
require('dotenv').config();
async function insertOpenAiHandler(){
    const deep = new DeepClient({ deep: guestDeep, ...admin });
    const anyTypeLinkId = await deep.id('@deep-foundation/core', "Any");
    const userTypeLinkId=await deep.id('@deep-foundation/core', "User")
    const typeTypeLinkId = await deep.id('@deep-foundation/core', "Type");
    const syncTextFileTypeLinkId = await deep.id('@deep-foundation/core', "SyncTextFile")
    const containTypeLinkId = await deep.id('@deep-foundation/core', "Contain")
    const supportsJsLinkId = await deep.id('@deep-foundation/core', "dockerSupportsJs" /* | "plv8SupportsJs" */)
    const handlerTypeLinkId = await deep.id('@deep-foundation/core', "Handler")
    const handleOperationLinkId = await deep.id('@deep-foundation/core', "HandleInsert" /* | HandleUpdate | HandleDelete */);
    const handleName = "HandleName";
    const packageLinkId = await deep.id('@deep-foundation/core', "Package");

    const installPackage = async () => {
        const apolloClient = generateApolloClient({
            path: process.env.NEXT_PUBLIC_GQL_PATH || '', // <<= HERE PATH TO UPDATE
            ssl: !!~process.env.NEXT_PUBLIC_GQL_PATH.indexOf('localhost')
                ? false
                : true,
        });
    }
        const unloginedDeep = new DeepClient({ apolloClient });
        const guest = await unloginedDeep.guest();
        const guestDeep = new DeepClient({ deep: unloginedDeep, ...guest });
        const admin = await guestDeep.login({
            linkId: await guestDeep.id('deep', 'admin'),
        });

    const { data: [{id:userInputLinkId}] } = await deep.insert({
        type_id:syncTextFileTypeLinkId,
        string: { data: { value: "user input" } },
        in: {
            data: {
                type_id: containTypeLinkId,
                from_id: deep.linkId,
            },
        }
    })

    const { data: [{id:openAiRequestTypeLinkId}] } = await deep.insert({
        type_id: typeTypeLinkId,
        from_id: userTypeLinkId,
        to_id: anyTypeLinkId,
        in: {
            data: {
                type_id: containTypeLinkId,
                from_id: packageLinkId,
                string: {data: { value: "OpenAiRequest"}}
            },
        }
    });

    const { data: [{ id: openAiApiKeyTypeLinkId, }] } = await deep.insert({
        type_id: typeTypeLinkId,
        in: {
            data: {
                type_id: containTypeLinkId,
                from_id: packageLinkId,
                string: {data: { value: "OpenAiApiKey"}}
            },
        }
    });

    const { data: [{ id: openAiApiKeyLinkId }] } = await deep.insert({
        type_id: openAiApiKeyTypeLinkId,
        string: { data: { value: process.env.OPENAI_API_KEY } },
        in: {
            data: {
                type_id: containTypeLinkId,
                from_id: deep.linkId,
            },
        }
    });

    await deep.insert({
        type_id: syncTextFileTypeLinkId,
        in: {
            data: [
                {
                    type_id: containTypeLinkId,
                    from_id: packageLinkId, // before created package
                    string: {data: {value: "OpenAiRequestHandlerCode"}},
                },
                {
                    from_id: supportsJsLinkId,
                    type_id: handlerTypeLinkId,
                    in: {
                        data: [
                            {
                                type_id: containTypeLinkId,
                                from_id: packageLinkId, // before created package
                                string: {data: {value: "OpenAiRequestHandler"}},
                            },
                            {
                                type_id: handleOperationLinkId,
                                // The type of link which operation will trigger handler. Example: insert handle will be triggered if you insert a link with this type_id
                                from_id: openAiRequestTypeLinkId,
                                in: {
                                    data: [
                                        {
                                            type_id: containTypeLinkId,
                                            from_id: packageLinkId, // before created package
                                            string: {data: {value: handleName}},
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
            ],
        },
        string: {
            data: {
                value: fs.readFileSync('packages/sdk/imports/openai/requestHandler.js', {encoding: 'utf-8'}),
            },
        },
    });
}