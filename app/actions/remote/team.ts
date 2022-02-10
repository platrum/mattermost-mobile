// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Model} from '@nozbe/watermelondb';
import {DeviceEventEmitter} from 'react-native';

import {removeUserFromTeam as localRemoveUserFromTeam} from '@actions/local/team';
import {Events} from '@constants';
import DatabaseManager from '@database/manager';
import NetworkManager from '@init/network_manager';
import {prepareMyChannelsForTeam, queryDefaultChannelForTeam} from '@queries/servers/channel';
import {prepareCommonSystemValues, queryCurrentTeamId} from '@queries/servers/system';
import {addTeamToTeamHistory, prepareDeleteTeam, prepareMyTeams, queryNthLastChannelFromTeam, queryTeamsById, syncTeamTable} from '@queries/servers/team';
import {isTablet} from '@utils/helpers';

import {fetchMyChannelsForTeam, switchToChannelById} from './channel';
import {fetchPostsForChannel, fetchPostsForUnreadChannels} from './post';
import {fetchRolesIfNeeded} from './role';
import {forceLogoutIfNecessary} from './session';

import type ClientError from '@client/rest/error';

export type MyTeamsRequest = {
    teams?: Team[];
    memberships?: TeamMembership[];
    error?: unknown;
}

export const addUserToTeam = async (serverUrl: string, teamId: string, userId: string, fetchOnly = false) => {
    let client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    try {
        const member = await client.addToTeam(teamId, userId);

        if (!fetchOnly) {
            fetchRolesIfNeeded(serverUrl, member.roles.split(' '));
            const {channels, memberships: channelMembers} = await fetchMyChannelsForTeam(serverUrl, teamId, false, 0, true);
            const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
            if (operator) {
                const myTeams: MyTeam[] = [{
                    id: member.team_id,
                    roles: member.roles,
                }];

                const models = await Promise.all([
                    operator.handleMyTeam({myTeams, prepareRecordsOnly: true}),
                    operator.handleTeamMemberships({teamMemberships: [member], prepareRecordsOnly: true}),
                    prepareMyChannelsForTeam(operator, teamId, channels || [], channelMembers || []),
                ]);

                if (models.length) {
                    const flattenedModels = models.flat() as Model[];
                    if (flattenedModels?.length > 0) {
                        await operator.batchRecords(flattenedModels);
                    }
                }

                if (await isTablet()) {
                    const channel = await queryDefaultChannelForTeam(operator.database, teamId);
                    if (channel) {
                        fetchPostsForChannel(serverUrl, channel.id);
                    }
                }
            }
        }

        return {member};
    } catch (error) {
        forceLogoutIfNecessary(serverUrl, error as ClientError);
        return {error};
    }
};

export const fetchMyTeams = async (serverUrl: string, fetchOnly = false): Promise<MyTeamsRequest> => {
    let client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    try {
        const [teams, memberships]: [Team[], TeamMembership[]] = await Promise.all([
            client.getMyTeams(),
            client.getMyTeamMembers(),
        ]);

        if (!fetchOnly) {
            const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
            const modelPromises: Array<Promise<Model[]>> = [];
            if (operator) {
                const removeTeamIds = memberships.filter((m) => m.delete_at > 0).map((m) => m.team_id);
                const remainingTeams = teams.filter((t) => !removeTeamIds.includes(t.id));
                const prepare = prepareMyTeams(operator, remainingTeams, memberships);
                if (prepare) {
                    modelPromises.push(...prepare);
                }

                if (removeTeamIds.length) {
                    if (removeTeamIds?.length) {
                        // Immediately delete myTeams so that the UI renders only teams the user is a member of.
                        const removeTeams = await queryTeamsById(operator.database, removeTeamIds);
                        removeTeams?.forEach((team) => {
                            modelPromises.push(prepareDeleteTeam(team));
                        });
                    }
                }

                if (modelPromises.length) {
                    const models = await Promise.all(modelPromises);
                    const flattenedModels = models.flat() as Model[];
                    if (flattenedModels?.length > 0) {
                        await operator.batchRecords(flattenedModels);
                    }
                }
            }
        }

        return {teams, memberships};
    } catch (error) {
        forceLogoutIfNecessary(serverUrl, error as ClientError);
        return {error};
    }
};

export const fetchMyTeam = async (serverUrl: string, teamId: string, fetchOnly = false): Promise<MyTeamsRequest> => {
    let client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    try {
        const [team, membership] = await Promise.all([
            client.getTeam(teamId),
            client.getTeamMember(teamId, 'me'),
        ]);
        if (!fetchOnly) {
            const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
            const modelPromises: Array<Promise<Model[]>> = [];
            if (operator) {
                const prepare = prepareMyTeams(operator, [team], [membership]);
                if (prepare) {
                    modelPromises.push(...prepare);
                }
                if (modelPromises.length) {
                    const models = await Promise.all(modelPromises);
                    const flattenedModels = models.flat() as Model[];
                    if (flattenedModels?.length > 0) {
                        await operator.batchRecords(flattenedModels);
                    }
                }
            }
        }

        return {teams: [team], memberships: [membership]};
    } catch (error) {
        forceLogoutIfNecessary(serverUrl, error as ClientError);
        return {error};
    }
};

export const fetchAllTeams = async (serverUrl: string, fetchOnly = false): Promise<MyTeamsRequest> => {
    let client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    try {
        const teams = await client.getTeams();

        if (!fetchOnly) {
            const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
            if (operator) {
                syncTeamTable(operator, teams);
            }
        }

        return {teams};
    } catch (error) {
        forceLogoutIfNecessary(serverUrl, error as ClientError);
        return {error};
    }
};

export const fetchTeamsChannelsAndUnreadPosts = async (serverUrl: string, since: number, teams: Team[], memberships: TeamMembership[], excludeTeamId?: string) => {
    const database = DatabaseManager.serverDatabases[serverUrl]?.database;
    if (!database) {
        return {error: `${serverUrl} database not found`};
    }

    const myTeams = teams.filter((t) => memberships.find((m) => m.team_id === t.id && t.id !== excludeTeamId));

    for await (const team of myTeams) {
        const {channels, memberships: members} = await fetchMyChannelsForTeam(serverUrl, team.id, since > 0, since, false, true);

        if (channels?.length && members?.length) {
            fetchPostsForUnreadChannels(serverUrl, channels, members);
        }
    }

    return {error: undefined};
};

export const fetchTeamByName = async (serverUrl: string, teamName: string, fetchOnly = false) => {
    let client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    try {
        const team = await client.getTeamByName(teamName);

        if (!fetchOnly) {
            const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
            if (operator) {
                const model = await operator.handleTeam({teams: [team], prepareRecordsOnly: true});
                if (model) {
                    await operator.batchRecords(model);
                }
            }
        }

        return {team};
    } catch (error) {
        forceLogoutIfNecessary(serverUrl, error as ClientError);
        return {error};
    }
};

export const removeUserFromTeam = async (serverUrl: string, teamId: string, userId: string, fetchOnly = false) => {
    let client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    try {
        await client.removeFromTeam(teamId, userId);

        if (!fetchOnly) {
            localRemoveUserFromTeam(serverUrl, teamId);
            fetchAllTeams(serverUrl);
        }

        return {error: undefined};
    } catch (error) {
        forceLogoutIfNecessary(serverUrl, error as ClientError);
        return {error};
    }
};

export const handleTeamChange = async (serverUrl: string, teamId: string) => {
    const {operator, database} = DatabaseManager.serverDatabases[serverUrl];
    const currentTeamId = await queryCurrentTeamId(database);

    if (currentTeamId === teamId) {
        return;
    }

    let channelId = '';
    if (await isTablet()) {
        channelId = await queryNthLastChannelFromTeam(database, teamId);
        if (channelId) {
            await switchToChannelById(serverUrl, channelId, teamId);
            return;
        }
    }

    const models = [];
    const system = await prepareCommonSystemValues(operator, {currentChannelId: channelId, currentTeamId: teamId});
    if (system?.length) {
        models.push(...system);
    }
    const history = await addTeamToTeamHistory(operator, teamId, true);
    if (history.length) {
        models.push(...history);
    }

    if (models.length) {
        await operator.batchRecords(models);
    }

    const {channels, memberships, error} = await fetchMyChannelsForTeam(serverUrl, teamId);
    if (error) {
        DeviceEventEmitter.emit(Events.TEAM_LOAD_ERROR, serverUrl, error);
    }

    if (channels?.length && memberships?.length) {
        fetchPostsForUnreadChannels(serverUrl, channels, memberships, channelId);
    }
};