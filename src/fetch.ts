import electronFetch, { RequestInit, Response } from 'electron-fetch'

export default function fetch(url: string, options?: RequestInit): Promise<Response> {
    return electronFetch(url, { ...options, useElectronNet: false });
}
