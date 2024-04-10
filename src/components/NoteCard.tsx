import { RELAYS } from "../utils/constants";
import { signEvent } from 'nostr-tools';
import { LightningAddress } from "@getalby/lightning-tools";

interface Props {
    content: string;
    user: {
      name: string;
      image: string | undefined;
      pubkey: string;
    };
    created_at: number;
    hashtags: string[];
  }
  
  export default function NoteCard({
    content,
    user,
    created_at,
    hashtags,
  }: Props) {

    async function sendZap() {
      const ln = new LightningAddress("mikk@vlt.ge");
      //const ln = new LightningAddress("holidayverdict83@walletofsatoshi.com");
      await ln.fetch();

      console.log(ln.lnurlpData);

      const event = {
          satoshi: 10,
          comment: "Awesome post",
          relays: RELAYS,
          e: "467d2bb6c0dd1067cf72eb517fa875bc4555b8370905fd97d593ceb1b479b2eb"
      };
      //const signed = await window.nostr.signEvent(event);
      const response = await ln.zap(event);
      //const response = await ln.zap({
      //  satoshi: 10,
      //  comment: "Awesome post",
      //  relays: RELAYS,
      //  e: "467d2bb6c0dd1067cf72eb517fa875bc4555b8370905fd97d593ceb1b479b2eb"
      //});

      console.log(response.preimage);

      //const invoice = await ln.requestInvoice({ satoshi: 1 });

      //console.log(invoice.paymentRequest);
      //console.log(invoice.paymentHash);
    }

    return (
      <div className="rounded p-16 border border-gray-600 bg-gray-700 flex flex-col gap-16 break-words">
        <div className="flex gap-12 items-center overflow-hidden">
          {user.image ?
          <img
            src={user.image}
            alt="note"
            className="rounded-full w-40 aspect-square bg-gray-100"
          /> : <></>}
          <div>
            <span
              className="text-body3 text-white overflow-hidden text-ellipsis"
            >
              {user.name}
            </span>
            <span className="px-16 text-body5 text-gray-400">
              {new Date(created_at * 1000).toISOString().split("T")[0]}
            </span>
          </div>
        </div>
        <p>{content}</p>
        <ul className="flex flex-wrap gap-12">
          {hashtags
            .filter((t) => hashtags.indexOf(t) === hashtags.lastIndexOf(t))
            .map((hashtag) => (
              <li
                key={hashtag}
                className="bg-gray-300 text-body5 text-gray-900 font-medium rounded-24 px-12 py-4"
              >
                #{hashtag}
              </li>
            ))}
        </ul>
        <div>
          <button
          onClick={sendZap}>Zap</button>
        </div>
      </div>
    );
  }
  