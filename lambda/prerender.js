import { PrerenderCloud } from 'prerendercloud';

const prerendercloud = new PrerenderCloud();

export const handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    prerendercloud.set('prerenderToken', process.env.PRERENDER_TOKEN);

    const userAgent = headers['user-agent'] && headers['user-agent'][0] ? headers['user-agent'][0].value : '';
    const shouldPrerender = prerendercloud.shouldPrerender(request.uri, userAgent);

    if (shouldPrerender) {
        const protocol = request.origin.custom.protocol || 'https';
        const host = headers.host[0].value;
        const newUrl = `${protocol}://${host}${request.uri}`;

        request.origin = {
            custom: {
                domainName: 'service.prerender.io',
                port: 443,
                protocol: 'https',
                path: '',
                sslProtocols: ['TLSv1', 'TLSv1.1'],
                readTimeout: 30,
                keepaliveTimeout: 5,
                customHeaders: {}
            }
        };
        request.headers['x-prerender-token'] = [{ key: 'X-Prerender-Token', value: process.env.PRERENDER_TOKEN }];
        request.headers['x-original-host'] = [{ key: 'X-Original-Host', value: host }];
        request.uri = '/https%3A%2F%2F' + host + request.uri;
        request.querystring = '';
    }

    return request;
};