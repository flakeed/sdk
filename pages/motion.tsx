import React, {useEffect} from 'react';
import {PluginListenerHandle} from '@capacitor/core';
import {Motion} from '@capacitor/motion';
import {useLocalStore} from "@deep-foundation/store/local";
import { DeepClient } from '@deep-foundation/deeplinks/imports/client';
import {
    useDeep,
    DeepProvider,
} from "@deep-foundation/deeplinks/imports/client";
import {Button, ChakraProvider, Stack, Text} from "@chakra-ui/react";
import {PACKAGE_NAME as DEVICE_PACKAGE_NAME} from "../imports/device/package-name";
