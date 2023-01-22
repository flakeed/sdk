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

let accelHandler:PluginListenerHandle;
let orientationHandler:PluginListenerHandle;

async function Content(){
    const deep=useDeep();
    const [deviceLinkId,setDeviceLinkId]=useLocalStore(
        'deviceLinkId',
        undefined
    );

    const [requests, setRequest] = useLocalStore("Requests", []);
    const motionLinkId = await deep.id(deep.linkId, "Motion");
    const requestAccelLinkId = await deep.id(motionLinkId, "Accel");
    const requestOrientationLinkId = await deep.id(motionLinkId, "Orientation");
    const stopAccelerationLinkId = await deep.id(motionLinkId, "Stop");
    const removeListenersLinkId = await deep.id(motionLinkId, "Remove");


    const containTypeLinkId = await deep.id('@deep-foundation/core', 'Contain');

    async function subscribeToRequestAccelStatus() {
        accelHandler=await Motion.addListener('accel', event => {
            console.log(event);

            useEffect(() => {
                const updateRequestStatus = async (requests) => {
                    const {
                        data: [{id: _requestAccelLinkId}],
                    } = await deep.insert({
                        link_id: requestAccelLinkId,
                        value: requests.accepted ? "accepted" : "accept",
                    },{ table: "strings" });
                }
                if (requests.length > 0) {
                    updateRequestStatus(requests);
                    setRequest([]);
                }
            }, [requests])
        })
    }

    async function subscribeToRequestOrientationStatus() {
        orientationHandler=await Motion.addListener('orientation', event => {
            console.log(event);

            useEffect(() => {
                const updateRequestStatus = async (requests) => {
                    const {
                        data: [{id: _requestOrientationLinkId}],
                    } = await deep.insert({
                        link_id: requestOrientationLinkId,
                        value: requests.accepted ? "accepted" : "accept",
                    },{ table: "strings" });
                }
                if (requests.length > 0) {
                    updateRequestStatus(requests);
                    setRequest([]);
                }
            }, [requests])
        })
    }

    async function stopAcceleration(){
        const stopAcceleration = () => {
            if (accelHandler) {
                accelHandler.remove();
            }
        }
        const {
            data: [{id: _stopAccelerationLinkId}],
        } = await deep.insert({
            link_id: stopAccelerationLinkId,
            value: "Stopped",
        },{ table: "strings" });
    }

    async function removeAllListeners(){
        const removeListeners = () => {
            Motion.removeAllListeners();
        };
        const {
            data: [{id: _removeListenersLinkId}],
        } = await deep.insert({
            link_id: removeListenersLinkId,
            value: "Removed",
        },{ table: "strings" });
    }

    return (
        <Stack>
            <Text>{deviceLinkId}</Text>
            <Button
                onClick={async ()=>{
                    try{
                        await (DeviceMotionEvent as any).requestPermission()
                    }
                    catch (e){
                        //TODO
                    }
                    await subscribeToRequestAccelStatus();
                }}>
                Request Accel Permission
            </Button>

            <Button
                onClick={async ()=>{
                    try{
                        await (DeviceMotionEvent as any).requestPermission()
                    }
                    catch (e){
                        //TODO
                    }
                    await subscribeToRequestOrientationStatus();
                }}>
                Request Orientation Permission
            </Button>

            <Button
                onClick={async ()=>{
                    await stopAcceleration();
                }}>
                Stop the acceleration
            </Button>

            <Button
                onClick={async ()=>{
                    await removeAllListeners();
                }}>
                Remove Listeners
            </Button>
        </Stack>
    )
}